package nodes

// The Degradation node's history from the IoT database. Each group reads
// its messages through the view iot_datasource.Table_<groupUid> (timestamp,
// topic, payload), as the IoTDb node and the AI agents do; a stored message
// of a topic has topic = 'Topic_<topicUid>'. Only the view's name, checked,
// is written into the SQL; everything else goes as parameters.

import (
	"context"
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

var degradationGroupUidRe = regexp.MustCompile(`^[A-Za-z0-9_]{1,64}$`)

// jsonPath turns "a.b.0" into the text[] path of the #> operator.
func jsonPath(path string) []string {
	path = strings.TrimPrefix(strings.TrimSpace(path), "payload.")
	if path == "" || path == "payload" {
		return []string{}
	}
	return strings.Split(path, ".")
}

// degradationHistorySQL is the query of the buckets (start, key, sum,
// count) of the field in the stored messages of a topic in [from, to).
// The key is the node's partition key as the live messages give it: ""
// without one, the topic's live subject for "topic", or a payload field.
func degradationHistorySQL(c *degradationConfig, groupUid, storedTopic, liveSubject string, from, to time.Time) (string, []any, error) {
	if !degradationGroupUidRe.MatchString(groupUid) {
		return "", nil, fmt.Errorf("invalid group uid")
	}
	view := "iot_datasource.Table_" + groupUid
	args := []any{c.bucketInterval(), c.Location.String(), jsonPath(c.HistoryField), storedTopic, from, to}
	keyExpr := "''"
	switch key := strings.TrimSpace(c.KeyPath); {
	case key == "":
	case key == "topic":
		args = append(args, liveSubject)
		keyExpr = "$7::text"
	default:
		args = append(args, jsonPath(key))
		keyExpr = "COALESCE(payload #>> $7::text[], '')"
	}
	sql := fmt.Sprintf(`SELECT time_bucket($1::interval, ts, $2::text) AS bucket, k, sum(v) AS s, count(v) AS n
	FROM (
		SELECT timestamp AS ts, %s AS k,
			CASE WHEN jsonb_typeof(payload #> $3::text[]) = 'number'
				THEN (payload #>> $3::text[])::double precision END AS v
		FROM %s
		WHERE topic = $4 AND timestamp >= $5 AND timestamp < $6
	) samples
	WHERE v IS NOT NULL
	GROUP BY bucket, k
	ORDER BY bucket`, keyExpr, view)
	return sql, args, nil
}

// thingDataRetentionSQL reads the retention policy of iot_data.thingData
// (patroni_metrics' init_metrics.sql: DATA_RETENTION_INTERVAL), in seconds.
const thingDataRetentionSQL = `SELECT EXTRACT(EPOCH FROM (config ->> 'drop_after')::interval)
	FROM timescaledb_information.jobs
	WHERE proc_name = 'policy_retention' AND hypertable_schema = 'iot_data' AND hypertable_name = 'thingdata'
	LIMIT 1`

type rowQuerier interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

// thingDataRetention is how long the IoT data are kept (false: no policy).
func thingDataRetention(ctx context.Context, db rowQuerier) (time.Duration, bool, error) {
	var seconds float64
	err := db.QueryRow(ctx, thingDataRetentionSQL).Scan(&seconds)
	if err == pgx.ErrNoRows {
		return 0, false, nil
	}
	if err != nil {
		return 0, false, err
	}
	return time.Duration(seconds * float64(time.Second)), seconds > 0, nil
}
