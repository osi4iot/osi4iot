package nodes

import (
	"math"
	"strconv"
	"strings"
	"sync"
	"time"
)

// The position of an asset that moves, from the messages of its geolocation
// sensors ("Mobile geolocation": latitude, longitude; "Geolocation":
// Latitude, Longitude), kept in its state (iot_data.assetState, section
// geolocation) by the AssetState node ("Update geolocation of current
// asset"). A phone sends its position every second or so: the position is
// written at most every geolocationMinInterval, and a position that has not
// moved geolocationMinMetres only every geolocationRefresh (to keep its time
// up to date); the last position received is written when the interval is
// over even if no message follows (a phone that stops).

const (
	geolocationMinInterval = 5 * time.Second
	geolocationRefresh     = time.Minute
	geolocationMinMetres   = 2.0
)

// geolocationPosition is a position read from a message
type geolocationPosition struct {
	Latitude  float64
	Longitude float64
	Accuracy  *float64
	At        time.Time
}

func (p geolocationPosition) state() map[string]any {
	s := map[string]any{
		"latitude":  p.Latitude,
		"longitude": p.Longitude,
		"at":        p.At.UTC().Format(time.RFC3339),
	}
	if p.Accuracy != nil {
		s["accuracy"] = *p.Accuracy
	}
	return s
}

// numberOf is a number of a payload (a number, or a text with a number)
func numberOf(v any) (float64, bool) {
	switch x := v.(type) {
	case float64:
		return x, !math.IsNaN(x) && !math.IsInf(x, 0)
	case float32:
		return float64(x), true
	case int:
		return float64(x), true
	case int64:
		return float64(x), true
	case string:
		f, err := strconv.ParseFloat(strings.TrimSpace(x), 64)
		return f, err == nil && !math.IsNaN(f) && !math.IsInf(f, 0)
	}
	return 0, false
}

// fieldOf is the value of the first of the names in the payload (case not
// minded: "latitude" and "Latitude")
func fieldOf(payload map[string]any, names ...string) (any, bool) {
	for _, name := range names {
		if v, ok := payload[name]; ok {
			return v, true
		}
	}
	for key, v := range payload {
		for _, name := range names {
			if strings.EqualFold(key, name) {
				return v, true
			}
		}
	}
	return nil, false
}

// positionFromPayload reads the position of a message: latitude (-90…90) and
// longitude (-180…180), or lat / lon / lng; accuracy (m) and timestamp
// (RFC 3339) if it has them (else now). ok false: not a position.
func positionFromPayload(payload map[string]any, now time.Time) (geolocationPosition, bool) {
	if payload == nil {
		return geolocationPosition{}, false
	}
	latRaw, okLat := fieldOf(payload, "latitude", "lat")
	lonRaw, okLon := fieldOf(payload, "longitude", "lon", "lng")
	if !okLat || !okLon {
		return geolocationPosition{}, false
	}
	lat, okLat := numberOf(latRaw)
	lon, okLon := numberOf(lonRaw)
	if !okLat || !okLon || lat < -90 || lat > 90 || lon < -180 || lon > 180 {
		return geolocationPosition{}, false
	}
	p := geolocationPosition{Latitude: lat, Longitude: lon, At: now}
	if raw, ok := fieldOf(payload, "accuracy"); ok {
		if a, ok := numberOf(raw); ok && a >= 0 {
			p.Accuracy = &a
		}
	}
	if raw, ok := payload["timestamp"].(string); ok {
		if t, err := time.Parse(time.RFC3339Nano, raw); err == nil {
			p.At = t
		}
	}
	return p, true
}

// metresBetween is the distance between two positions (haversine, m)
func metresBetween(a, b geolocationPosition) float64 {
	const earth = 6371000.0
	rad := math.Pi / 180
	dLat := (b.Latitude - a.Latitude) * rad
	dLon := (b.Longitude - a.Longitude) * rad
	h := math.Sin(dLat/2)*math.Sin(dLat/2) + math.Cos(a.Latitude*rad)*math.Cos(b.Latitude*rad)*math.Sin(dLon/2)*math.Sin(dLon/2)
	return 2 * earth * math.Asin(math.Min(1, math.Sqrt(h)))
}

// geolocationThrottle says which positions to write
type geolocationThrottle struct {
	mu        sync.Mutex
	written   *geolocationPosition
	writtenAt time.Time
	pending   *geolocationPosition
}

// offer: a new position; returns the one to write now (nil: none now; it is
// kept to write when the interval is over, see due)
func (t *geolocationThrottle) offer(p geolocationPosition, now time.Time) *geolocationPosition {
	t.mu.Lock()
	defer t.mu.Unlock()
	if t.written == nil {
		return t.take(p, now)
	}
	elapsed := now.Sub(t.writtenAt)
	moved := metresBetween(*t.written, p) >= geolocationMinMetres
	if elapsed >= geolocationMinInterval && (moved || elapsed >= geolocationRefresh) {
		return t.take(p, now)
	}
	if moved {
		t.pending = &p
	}
	return nil
}

// due: the position kept, if its time to be written has come (nil: none)
func (t *geolocationThrottle) due(now time.Time) *geolocationPosition {
	t.mu.Lock()
	defer t.mu.Unlock()
	if t.pending == nil || now.Sub(t.writtenAt) < geolocationMinInterval {
		return nil
	}
	return t.take(*t.pending, now)
}

func (t *geolocationThrottle) take(p geolocationPosition, now time.Time) *geolocationPosition {
	t.written = &p
	t.writtenAt = now
	t.pending = nil
	return &p
}

// forget: a write that failed (the next position is written as soon as it comes)
func (t *geolocationThrottle) forget() {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.written = nil
}
