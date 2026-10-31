// Package agentdata serves the AI agents' MCP servers sensor_history and
// asset_state: the historical data of the sensors of a digital twin's
// group and the states of its assets, read from the IoT DB
// (patroni_metrics).
//
// It works as the knowledge bases do for doc_info (package rag): an HTTP
// endpoint on the loopback interface, reachable only from the processes
// of this container (the agents' MCP servers), and a token per digital
// twin, an HMAC with a key new at every start, that pipelines gives the
// MCP servers it starts. With it they read the data of that digital
// twin's group, and nothing else: the MCP servers get no database
// credentials, and every query is a read-only SELECT bounded to the group
// (see queries.go).
package agentdata

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"pipelines/common"
	"pipelines/logger"
)

// Source is what the service needs from pipelines (the flows manager).
type Source interface {
	GetGroup(groupId int) *common.Group
	GetDigitalTwin(digitalTwinId int) *common.DigitalTwin
	GetAssetsByGroupId(groupId int) []*common.Asset
	// SensorsInGroup asks admin_api for the group's sensors.
	SensorsInGroup(ctx context.Context, groupId int) ([]*common.Sensor, error)
}

// Service is the endpoint of one pipelines replica.
type Service struct {
	addr     string
	db       DB
	source   Source
	log      *logger.Logger
	tokenKey []byte
	now      func() time.Time

	// The group's sensors, asked to admin_api at most every sensorsTTL.
	sensorsMu sync.Mutex
	sensors   map[int]cachedSensors
}

type cachedSensors struct {
	at      time.Time
	sensors []*common.Sensor
}

const sensorsTTL = time.Minute

// NewService returns the service; Start serves it on addr (loopback only).
func NewService(addr string, db DB, source Source, log *logger.Logger) (*Service, error) {
	key := make([]byte, 32)
	if _, err := rand.Read(key); err != nil {
		return nil, err
	}
	return &Service{
		addr:     addr,
		db:       db,
		source:   source,
		log:      log,
		tokenKey: key,
		now:      time.Now,
		sensors:  map[int]cachedSensors{},
	}, nil
}

// DigitalTwinToken is what a digital twin's MCP servers present: valid for
// that digital twin only, until pipelines restarts.
func (s *Service) DigitalTwinToken(groupID, digitalTwinID int) string {
	mac := hmac.New(sha256.New, s.tokenKey)
	mac.Write([]byte("agentdata-dt:" + strconv.Itoa(groupID) + ":" + strconv.Itoa(digitalTwinID)))
	return hex.EncodeToString(mac.Sum(nil))
}

// BaseURL is the endpoint the MCP servers call.
func (s *Service) BaseURL() string {
	return "http://" + s.addr + "/v1/agentdata"
}

// Handler serves the endpoints (Start serves it; tests call it directly).
func (s *Service) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("POST /v1/agentdata/sensors", s.handleSensors)
	mux.HandleFunc("POST /v1/agentdata/statistics", s.handleStatistics)
	mux.HandleFunc("POST /v1/agentdata/history", s.handleHistory)
	mux.HandleFunc("POST /v1/agentdata/latest", s.handleLatest)
	mux.HandleFunc("POST /v1/agentdata/asset_states", s.handleAssetStates)
	return mux
}

// Start serves the endpoint on the loopback interface until ctx ends.
func (s *Service) Start(ctx context.Context) error {
	host, _, err := net.SplitHostPort(s.addr)
	if err != nil {
		return fmt.Errorf("agentData.addr %q: %w", s.addr, err)
	}
	if ip := net.ParseIP(host); host != "localhost" && (ip == nil || !ip.IsLoopback()) {
		return fmt.Errorf("agentData.addr %q must be a loopback address", s.addr)
	}
	ln, err := net.Listen("tcp", s.addr)
	if err != nil {
		return fmt.Errorf("agent data endpoint: %w", err)
	}
	srv := &http.Server{Handler: s.Handler(), ReadHeaderTimeout: 5 * time.Second}
	go func() {
		<-ctx.Done()
		shutdown, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = srv.Shutdown(shutdown)
	}()
	go func() {
		if err := srv.Serve(ln); err != nil && !errors.Is(err, http.ErrServerClosed) {
			s.log.Errorf("Agent data endpoint stopped: %v", err)
		}
	}()
	s.log.Infof("Agent data endpoint (sensor history, asset states) listening on %s", s.addr)
	return nil
}

// Request is what the MCP servers send: the digital twin, its token and
// the call's arguments.
type Request struct {
	GroupID       int    `json:"group_id"`
	DigitalTwinID int    `json:"digital_twin_id"`
	Token         string `json:"token"`

	Sensor   string `json:"sensor,omitempty"`
	Field    string `json:"field,omitempty"`
	From     string `json:"from,omitempty"`
	To       string `json:"to,omitempty"`
	Interval string `json:"interval,omitempty"` // auto, 15m, 1h, raw
	Limit    int    `json:"limit,omitempty"`
	// Asset narrows the sensors (or names the asset whose state is
	// asked): its uid, its description, or "current" (the digital twin's).
	Asset string `json:"asset,omitempty"`
}

// call is a checked request: the group and the digital twin.
type call struct {
	Request
	groupUid  string
	dtAssetID int
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

func (s *Service) readCall(w http.ResponseWriter, r *http.Request) (*call, bool) {
	var req Request
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10)).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request")
		return nil, false
	}
	if !hmac.Equal([]byte(s.DigitalTwinToken(req.GroupID, req.DigitalTwinID)), []byte(req.Token)) {
		writeError(w, http.StatusForbidden, "invalid token for this digital twin")
		return nil, false
	}
	group := s.source.GetGroup(req.GroupID)
	dt := s.source.GetDigitalTwin(req.DigitalTwinID)
	if group == nil || dt == nil || dt.GroupId != req.GroupID {
		writeError(w, http.StatusNotFound, "the digital twin is no longer in this group")
		return nil, false
	}
	return &call{Request: req, groupUid: group.GroupUID, dtAssetID: dt.AssetId}, true
}

// groupAssets returns the assets of the call's group, the digital twin's
// first.
func (s *Service) groupAssets(c *call) []AssetInfo {
	var out []AssetInfo
	for _, a := range s.source.GetAssetsByGroupId(c.GroupID) {
		if a == nil || a.GroupId != c.GroupID {
			continue
		}
		out = append(out, AssetInfo{Uid: a.AssetUid, Description: a.Description, Type: a.AssetType, OfDigitalTwin: a.Id == c.dtAssetID})
	}
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].OfDigitalTwin != out[j].OfDigitalTwin {
			return out[i].OfDigitalTwin
		}
		return out[i].Uid < out[j].Uid
	})
	return out
}

// digitalTwinAsset is the digital twin's own asset, nil when it has none.
func digitalTwinAsset(assets []AssetInfo) *AssetInfo {
	for _, a := range assets {
		if a.OfDigitalTwin {
			return &a
		}
	}
	return nil
}

// groupSensors returns the sensors of the call's group, the digital twin's
// asset's first.
func (s *Service) groupSensors(ctx context.Context, c *call) ([]SensorInfo, error) {
	s.sensorsMu.Lock()
	cached, ok := s.sensors[c.GroupID]
	s.sensorsMu.Unlock()
	raw := cached.sensors
	if !ok || s.now().Sub(cached.at) > sensorsTTL {
		fetched, err := s.source.SensorsInGroup(ctx, c.GroupID)
		if err != nil {
			if !ok {
				return nil, fmt.Errorf("the group's sensors could not be read: %w", err)
			}
			s.log.Warnf("Agent data: group %d sensors not refreshed: %v", c.GroupID, err)
		} else {
			raw = fetched
			s.sensorsMu.Lock()
			s.sensors[c.GroupID] = cachedSensors{at: s.now(), sensors: fetched}
			s.sensorsMu.Unlock()
		}
	}

	assets := map[int]*common.Asset{}
	for _, a := range s.source.GetAssetsByGroupId(c.GroupID) {
		if a != nil {
			assets[a.Id] = a
		}
	}
	out := make([]SensorInfo, 0, len(raw))
	for _, sn := range raw {
		if sn == nil || sn.GroupId != c.GroupID {
			continue
		}
		out = append(out, newSensorInfo(sn, assets, c.dtAssetID))
	}
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].OfDigitalTwin != out[j].OfDigitalTwin {
			return out[i].OfDigitalTwin
		}
		if out[i].AssetUid != out[j].AssetUid {
			return out[i].AssetUid < out[j].AssetUid
		}
		return out[i].Ref < out[j].Ref
	})
	return out, nil
}

// callSensor resolves the call's sensor, among those of its asset when
// the call names one.
func (s *Service) callSensor(ctx context.Context, c *call) (SensorInfo, error) {
	sensors, err := s.groupSensors(ctx, c)
	if err != nil {
		return SensorInfo{}, err
	}
	if strings.TrimSpace(c.Asset) != "" {
		asset, err := resolveAsset(s.groupAssets(c), c.Asset)
		if err != nil {
			return SensorInfo{}, err
		}
		var own []SensorInfo
		for _, sn := range sensors {
			if sn.AssetUid == asset.Uid {
				own = append(own, sn)
			}
		}
		if len(own) == 0 {
			return SensorInfo{}, fmt.Errorf("the asset %s has no sensors", asset.name())
		}
		if strings.TrimSpace(c.Sensor) == "" && len(own) == 1 {
			return own[0], nil
		}
		sensors = own
	}
	return resolveSensor(sensors, c.Sensor)
}

// sensorAndField resolves the call's sensor and field.
func (s *Service) sensorAndField(ctx context.Context, c *call) (SensorInfo, Field, error) {
	sn, err := s.callSensor(ctx, c)
	if err != nil {
		return SensorInfo{}, Field{}, err
	}
	f, err := resolveField(sn, c.Field)
	return sn, f, err
}

func (s *Service) handleSensors(w http.ResponseWriter, r *http.Request) {
	c, ok := s.readCall(w, r)
	if !ok {
		return
	}
	sensors, err := s.groupSensors(r.Context(), c)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"digital_twin_asset": digitalTwinAsset(s.groupAssets(c)),
		"sensors":            sensors,
	})
}

func (s *Service) handleStatistics(w http.ResponseWriter, r *http.Request) {
	c, ok := s.readCall(w, r)
	if !ok {
		return
	}
	from, to, err := timeRange(c.From, c.To, s.now())
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	sn, f, err := s.sensorAndField(r.Context(), c)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	st, err := statistics(r.Context(), s.db, c.groupUid, sn, f, from, to)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"sensor": sn, "field": f, "from": from, "to": to, "statistics": st,
	})
}

func (s *Service) handleHistory(w http.ResponseWriter, r *http.Request) {
	c, ok := s.readCall(w, r)
	if !ok {
		return
	}
	from, to, err := timeRange(c.From, c.To, s.now())
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	sn, f, err := s.sensorAndField(r.Context(), c)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	out := map[string]any{"sensor": sn, "field": f, "from": from, "to": to}

	if strings.EqualFold(strings.TrimSpace(c.Interval), "raw") {
		limit := c.Limit
		if limit <= 0 {
			limit = 200
		}
		if limit > MaxRawPoints {
			limit = MaxRawPoints
		}
		points, truncated, err := rawHistory(r.Context(), s.db, c.groupUid, sn, f, from, to, limit)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		out["interval"] = "raw"
		out["points"] = points
		out["truncated"] = truncated // only the last `limit` values of the range
		writeJSON(w, http.StatusOK, out)
		return
	}

	interval, adjusted, err := bucketInterval(c.Interval, from, to)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	buckets, err := aggregatedHistory(r.Context(), s.db, c.groupUid, sn, f, from, to, interval)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	truncated := len(buckets) > MaxBuckets
	if truncated {
		buckets = buckets[:MaxBuckets]
	}
	out["interval"] = HumanInterval(interval)
	out["interval_adjusted"] = adjusted
	out["buckets"] = buckets
	out["truncated"] = truncated
	writeJSON(w, http.StatusOK, out)
}

func (s *Service) handleLatest(w http.ResponseWriter, r *http.Request) {
	c, ok := s.readCall(w, r)
	if !ok {
		return
	}
	sn, err := s.callSensor(r.Context(), c)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	count := c.Limit
	if count <= 0 {
		count = 1
	}
	if count > 50 {
		count = 50
	}
	msgs, err := latestMessages(r.Context(), s.db, c.groupUid, sn, count)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"sensor": sn, "messages": msgs})
}

// AssetState is an asset of the group with its state.
type AssetState struct {
	AssetInfo
	Status           string         `json:"status"`
	StateDescription string         `json:"state_description"`
	State            map[string]any `json:"state"`
	LastUpdated      *time.Time     `json:"last_updated,omitempty"`
}

func (s *Service) handleAssetStates(w http.ResponseWriter, r *http.Request) {
	c, ok := s.readCall(w, r)
	if !ok {
		return
	}
	rows, err := assetStates(r.Context(), s.db, c.groupUid)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	assets := s.groupAssets(c)
	// One asset (uid, description or "current"); none: all of them.
	if strings.TrimSpace(c.Asset) != "" {
		a, err := resolveAsset(assets, c.Asset)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		assets = []AssetInfo{a}
	}

	out := make([]AssetState, 0, len(assets))
	for _, a := range assets {
		st := AssetState{
			AssetInfo:        a,
			Status:           "Unknown",
			StateDescription: common.DefaultAssetStateDescription,
			State:            map[string]any{},
		}
		if row, ok := rows[a.Uid]; ok {
			if row.State != nil {
				st.State = row.State
			}
			st.LastUpdated = row.LastUpdated
			if v, ok := st.State["status"].(string); ok && v != "" {
				st.Status = v
			}
			if v, ok := st.State["state_description"].(string); ok && v != "" {
				st.StateDescription = v
			}
		}
		out = append(out, st)
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"digital_twin_asset": digitalTwinAsset(s.groupAssets(c)),
		"assets":             out,
	})
}
