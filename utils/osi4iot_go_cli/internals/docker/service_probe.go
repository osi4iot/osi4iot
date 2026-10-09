package docker

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/nats-io/nats.go"

	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/utils"
)

// `osi4iot service state --probe`: besides asking each service how it
// is, really use it, the way the platform's own services do, in places
// reserved for this so nothing of the platform's data is touched:
//
//   NATS     subjects under osi4iot.probe.> and the JetStream stream
//            OSI4IOT_PROBE (subjects osi4iot.probe.js.>, at most 100
//            messages, kept 1 hour)
//   Patroni  the schema osi4iot_probe (table osi4iot_probe.probe) in the
//            platform's database of each cluster
//   Garage   the prefix osi4iot_probe/ in the platform's bucket
//
// Every probe removes what it wrote; whatever an interrupted probe left
// behind is removed by the next one (Patroni, NATS) or is one tiny
// object (Garage).

const (
	ProbeNatsSubjectPrefix = "osi4iot.probe"
	ProbeNatsStream        = "OSI4IOT_PROBE"
	ProbePatroniSchema     = "osi4iot_probe"
	ProbeGaragePrefix      = "osi4iot_probe/"

	natsProbeTimeout    = 5 * time.Second
	patroniProbeWait    = 15 * time.Second
	patroniProbeAppName = "osi4iot-probe"
)

func probeToken() string {
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func since(t time.Time) string {
	d := time.Since(t)
	if d < time.Second {
		return fmt.Sprintf("%d ms", d.Milliseconds())
	}
	return d.Round(100 * time.Millisecond).String()
}

// execEnv is exec with extra environment variables.
func (si swarmInstance) execEnv(env []string, cmd ...string) (string, error) {
	if !si.running() {
		return "", fmt.Errorf("%s has no running container", si.Service)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	stdout, stderr, code, err := execCapture(ctx, si.ndc.Cli, si.containerID, cmd, env)
	if err != nil {
		return "", err
	}
	if code != 0 {
		msg := strings.TrimSpace(firstNonEmpty(stderr, stdout))
		if msg == "" {
			msg = fmt.Sprintf("exit status %d", code)
		}
		return "", fmt.Errorf("%s", msg)
	}
	return stdout, nil
}

// ── NATS ─────────────────────────────────────────────────────────────

// natsPermissionErrors collects the asynchronous errors of a connection:
// a subject deploy_cli may not use is reported that way, not as the
// error of the call that used it.
type natsPermissionErrors struct {
	mu   sync.Mutex
	errs []string
}

func (p *natsPermissionErrors) handler(_ *nats.Conn, _ *nats.Subscription, err error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.errs = append(p.errs, err.Error())
}

// denied returns the permission violations seen so far, or "".
func (p *natsPermissionErrors) denied() string {
	p.mu.Lock()
	defer p.mu.Unlock()
	var out []string
	for _, e := range p.errs {
		if strings.Contains(strings.ToLower(e), "permissions violation") {
			out = append(out, e)
		}
	}
	return strings.Join(out, "; ")
}

func natsReplicaNumber(service string) int {
	if m := natsServiceRe.FindStringSubmatch(service); m != nil {
		n, _ := strconv.Atoi(m[1])
		return n
	}
	return 0
}

// probeNats checks, through two different servers when there are two:
//
//  1. core NATS: a message published on one server reaches a subscriber
//     on the other (routes really carry traffic);
//  2. JetStream: a message published to OSI4IOT_PROBE is acknowledged
//     (stored by a quorum of its copies) and can be read back.
func probeNats(h *ServiceHealth, pd *pt.PlatformData, views []natsInstanceView) {
	var ready []natsInstanceView
	for _, v := range views {
		if v.healthz == "ok" && v.si.NodeIP != "" {
			ready = append(ready, v)
		}
	}
	if len(ready) == 0 {
		h.probeFailed(HealthDown, "no NATS server is ready to probe")
		return
	}
	perms := &natsPermissionErrors{}
	connect := func(v natsInstanceView) (*nats.Conn, error) {
		port := 4222 + utils.NatsReplicaPortOffset(pd, natsReplicaNumber(v.si.Service), len(views))
		return connectDeployCliToNatsAt(pd, v.si.NodeIP, port, nats.ErrorHandler(perms.handler))
	}
	subSide, pubSide := ready[0], ready[len(ready)-1]

	subConn, err := connect(subSide)
	if err != nil {
		h.probeFailed(HealthDown, "could not connect to %s as deploy_cli: %v", subSide.si.Service, err)
		return
	}
	defer subConn.Close()
	pubConn := subConn
	if pubSide.si.Service != subSide.si.Service {
		if pubConn, err = connect(pubSide); err != nil {
			h.probeFailed(HealthDown, "could not connect to %s as deploy_cli: %v", pubSide.si.Service, err)
			return
		}
		defer pubConn.Close()
	}

	// 1. Core NATS.
	token := probeToken()
	subject := ProbeNatsSubjectPrefix + ".core." + token
	ch := make(chan *nats.Msg, 4)
	sub, err := subConn.ChanSubscribe(subject, ch)
	if err == nil {
		defer sub.Unsubscribe()
		err = subConn.Flush()
	}
	if err != nil {
		h.probeFailed(HealthDown, "could not subscribe on %s: %v", subSide.si.Service, err)
		return
	}
	start := time.Now()
	deadline := time.After(natsProbeTimeout)
	tick := time.NewTicker(250 * time.Millisecond)
	defer tick.Stop()
	delivered := false
	// Published again until it arrives: the subscription's interest
	// reaches the other server over the route a moment after Flush.
	_ = pubConn.Publish(subject, []byte(token))
	for !delivered {
		select {
		case m := <-ch:
			delivered = string(m.Data) == token
		case <-tick.C:
			_ = pubConn.Publish(subject, []byte(token))
		case <-deadline:
			if d := perms.denied(); d != "" {
				h.probeFailed(HealthDegraded, "the probe could not run: deploy_cli may not use %s.> (%s)",
					ProbeNatsSubjectPrefix, d)
				return
			}
			h.probeFailed(HealthDown, "a message published on %s did not reach a subscriber on %s within %s",
				pubSide.si.Service, subSide.si.Service, natsProbeTimeout)
			return
		}
	}
	if pubSide.si.Service != subSide.si.Service {
		h.probeOK("message published on %s delivered to a subscriber on %s in %s",
			pubSide.si.Service, subSide.si.Service, since(start))
	} else {
		h.probeOK("message published and delivered on %s in %s", pubSide.si.Service, since(start))
	}

	// 2. JetStream.
	js, err := pubConn.JetStream(nats.MaxWait(10 * time.Second))
	if err != nil {
		h.probeFailed(HealthDown, "JetStream: %v", err)
		return
	}
	replicas := utils.NatsStreamReplicas(len(views))
	cfg := &nats.StreamConfig{
		Name:        ProbeNatsStream,
		Description: "osi4iot service state --probe",
		Subjects:    []string{ProbeNatsSubjectPrefix + ".js.>"},
		Storage:     nats.FileStorage,
		Replicas:    replicas,
		MaxMsgs:     100,
		MaxAge:      time.Hour,
		Discard:     nats.DiscardOld,
	}
	jsFailed := func(what string, err error) {
		if d := perms.denied(); d != "" {
			h.probeFailed(HealthDegraded, "the probe could not run: deploy_cli may not use the %s stream (%s)",
				ProbeNatsStream, d)
			return
		}
		h.probeFailed(HealthDown, "JetStream: %s: %v", what, err)
	}
	info, err := js.StreamInfo(ProbeNatsStream)
	switch {
	case errors.Is(err, nats.ErrStreamNotFound):
		if _, err = js.AddStream(cfg); err != nil {
			jsFailed("could not create the stream "+ProbeNatsStream, err)
			return
		}
	case err != nil:
		jsFailed("could not read the stream "+ProbeNatsStream, err)
		return
	case info.Config.Replicas != replicas:
		// NATS was scaled since the stream was created.
		if _, err = js.UpdateStream(cfg); err != nil {
			jsFailed("could not set the stream "+ProbeNatsStream+" to "+strconv.Itoa(replicas)+" copies", err)
			return
		}
	}

	start = time.Now()
	ack, err := js.Publish(ProbeNatsSubjectPrefix+".js."+token, []byte(token))
	if err != nil {
		jsFailed("a message to the stream "+ProbeNatsStream+" was not stored", err)
		return
	}
	stored := since(start)
	msg, err := js.GetMsg(ProbeNatsStream, ack.Sequence)
	if err != nil || string(msg.Data) != token {
		if err == nil {
			err = fmt.Errorf("it came back different")
		}
		jsFailed("the stored message could not be read back", err)
		return
	}
	_ = js.DeleteMsg(ProbeNatsStream, ack.Sequence)
	copies := "1 copy"
	if replicas > 1 {
		copies = fmt.Sprintf("%d copies, acknowledged by a quorum", replicas)
	}
	h.probeOK("message stored in the JetStream stream %s (%s) in %s and read back", ProbeNatsStream, copies, stored)

	if info, err := js.StreamInfo(ProbeNatsStream); err == nil && info.Cluster != nil && replicas > 1 {
		var behind []string
		for _, r := range info.Cluster.Replicas {
			if !r.Current || r.Offline {
				behind = append(behind, r.Name)
			}
		}
		if len(behind) > 0 {
			h.probeFailed(HealthDegraded, "copies of %s not caught up: %s", ProbeNatsStream, strings.Join(behind, ", "))
		}
	}
}

// ── Patroni ──────────────────────────────────────────────────────────

// patroniProbeTarget is what differs between the two clusters.
type patroniProbeTarget struct {
	secretFile  string // sourced in the container: the cluster's passwords
	user        string // Patroni's superuser
	passwordVar string // its password, in secretFile
	database    string // the platform's database, a shell word
	writePort   int    // haproxy_patroni's primary-only port
}

func patroniProbeTargetOf(family string) patroniProbeTarget {
	if family == "patroni_metrics" {
		return patroniProbeTarget{"/run/secrets/patroni_metrics.txt", "patroni_metrics",
			"PATRONI_METRICS_PASSWORD", "iot_data_db", 5100}
	}
	return patroniProbeTarget{"/run/secrets/patroni_admin.txt", "patroni_admin",
		"PATRONI_ADMIN_PASSWORD", `"$POSTGRES_DB"`, 5000}
}

// psqlScript is a shell script that runs sql with psql against host:port
// as the cluster's superuser.
func (t patroniProbeTarget) psqlScript(host string, port int, sql string) string {
	return fmt.Sprintf(`set -e
. %s
export PGPASSWORD="$%s" PGCONNECT_TIMEOUT=10 PGAPPNAME=%s
psql -X -q -t -A -v ON_ERROR_STOP=1 -h %s -p %d -U %s -d %s <<'SQL'
SET client_min_messages = warning;
%s
SQL
`, t.secretFile, t.passwordVar, patroniProbeAppName, host, port, t.user, t.database, sql)
}

// replicaCheckScript waits, inside a replica's container, until the
// probe row is visible on its local PostgreSQL: one exec per replica.
func (t patroniProbeTarget) replicaCheckScript(token string) string {
	check := fmt.Sprintf(`SELECT 1 FROM %s.probe WHERE id = '%s'`, ProbePatroniSchema, token)
	tries := int(patroniProbeWait / (500 * time.Millisecond))
	return fmt.Sprintf(`. %s
export PGPASSWORD="$%s" PGCONNECT_TIMEOUT=5 PGAPPNAME=%s
i=0
while [ $i -lt %d ]; do
  r=$(psql -X -q -t -A -h localhost -p 5432 -U %s -d %s -c "%s" 2>/dev/null || true)
  [ "$r" = 1 ] && exit 0
  i=$((i+1)); sleep 0.5
done
exit 1
`, t.secretFile, t.passwordVar, patroniProbeAppName, tries, t.user, t.database, check)
}

// patroniProbeWriteSQL creates the probe schema if needed, clears what
// earlier probes may have left, writes one row and reads it back. The
// first line of output says whether the server is the primary.
func patroniProbeWriteSQL(token string) string {
	return fmt.Sprintf(`SELECT CASE WHEN pg_is_in_recovery() THEN 'replica' ELSE 'primary' END;
CREATE SCHEMA IF NOT EXISTS %[1]s;
COMMENT ON SCHEMA %[1]s IS 'Written by osi4iot service state --probe; holds nothing of the platform';
CREATE TABLE IF NOT EXISTS %[1]s.probe (
    id         text PRIMARY KEY,
    written_at timestamptz NOT NULL DEFAULT now()
);
DELETE FROM %[1]s.probe WHERE written_at < now() - interval '1 hour';
INSERT INTO %[1]s.probe (id) VALUES ('%[2]s');
SELECT id FROM %[1]s.probe WHERE id = '%[2]s';`, ProbePatroniSchema, token)
}

// probePatroni writes a row through haproxy_patroni — the way the
// platform's services reach the database — checks it went to the
// primary, then waits for it to appear on every replica.
func probePatroni(h *ServiceHealth, family string, instances []swarmInstance, cluster *patroniCluster) {
	t := patroniProbeTargetOf(family)
	var from *swarmInstance
	for i := range instances {
		if instances[i].running() {
			from = &instances[i]
			break
		}
	}
	if from == nil {
		h.probeFailed(HealthDown, "no %s node runs to probe from", family)
		return
	}

	token := probeToken()
	start := time.Now()
	out, err := from.exec("sh", "-c", t.psqlScript("haproxy_patroni", t.writePort, patroniProbeWriteSQL(token)))
	if err != nil {
		h.probeFailed(HealthDown, "could not write through haproxy_patroni:%d: %v", t.writePort, err)
		return
	}
	lines := strings.Fields(out)
	if len(lines) < 2 || lines[0] != "primary" || lines[len(lines)-1] != token {
		h.probeFailed(HealthDown, "writing through haproxy_patroni:%d gave an unexpected answer: %q",
			t.writePort, strings.TrimSpace(out))
		return
	}
	h.probeOK("row written to %s.probe through haproxy_patroni:%d (it reached the primary) in %s",
		ProbePatroniSchema, t.writePort, since(start))

	// Every running node Patroni does not call the leader must get it.
	leaderName := ""
	if cluster != nil {
		for _, m := range cluster.Members {
			if isPatroniLeader(m.Role) {
				leaderName = m.Name
			}
		}
	}
	for _, si := range instances {
		if !si.running() || si.Service == leaderName {
			continue
		}
		script := t.replicaCheckScript(token)
		start := time.Now()
		if _, err := si.exec("sh", "-c", script); err != nil {
			h.probeFailed(HealthDegraded, "the row did not reach the replica %s within %s", si.Service, patroniProbeWait)
			continue
		}
		h.probeOK("row replicated to %s in %s", si.Service, since(start))
	}

	cleanup := fmt.Sprintf(`DELETE FROM %s.probe WHERE id = '%s';`, ProbePatroniSchema, token)
	if _, err := from.exec("sh", "-c", t.psqlScript("haproxy_patroni", t.writePort, cleanup)); err != nil {
		h.note("The probe row could not be deleted (the next probe removes it): %v", err)
	}
}

// ── Garage ───────────────────────────────────────────────────────────

// probeGarage writes, reads back and deletes an object in the platform's
// bucket, through the "garage" endpoint the platform's services use and
// with the CLI's own key — from inside a Garage container, which has
// rclone and is on that network.
func probeGarage(h *ServiceHealth, pd *pt.PlatformData, views []garageInstanceView) {
	var from *swarmInstance
	for i := range views {
		if views[i].si.running() {
			from = &views[i].si
			break
		}
	}
	if from == nil {
		h.probeFailed(HealthDown, "no Garage instance runs to probe from")
		return
	}
	pi := pd.PlatformInfo
	creds := utils.S3KeyOf(&pi, utils.S3ConsumerCLI)
	if creds == nil || creds.AccessKeyID == "" {
		h.probeFailed(HealthDegraded, "the probe could not run: the CLI has no Garage key in the state file")
		return
	}
	env := rcloneEnv(utils.GarageS3Endpoint, *creds)
	token := probeToken()
	target := rcloneTarget(pi.S3BucketName, ProbeGaragePrefix+token)

	start := time.Now()
	if _, err := from.execEnv(env, "sh", "-c", fmt.Sprintf("printf '%%s' '%s' | rclone rcat '%s'", token, target)); err != nil {
		h.probeFailed(HealthDown, "could not write the object %s%s: %v", ProbeGaragePrefix, token, err)
		return
	}
	h.probeOK("object written to %s/%s%s in %s", pi.S3BucketName, ProbeGaragePrefix, token, since(start))

	start = time.Now()
	got, err := from.execEnv(env, "rclone", "cat", target)
	switch {
	case err != nil:
		h.probeFailed(HealthDown, "could not read the object back: %v", err)
	case strings.TrimSpace(got) != token:
		h.probeFailed(HealthDown, "the object came back different from what was written")
	default:
		h.probeOK("object read back in %s", since(start))
	}

	if _, err := from.execEnv(env, "rclone", "deletefile", target); err != nil {
		h.probeFailed(HealthDegraded, "could not delete the object %s%s: %v", ProbeGaragePrefix, token, err)
		return
	}
	h.probeOK("object deleted")
}
