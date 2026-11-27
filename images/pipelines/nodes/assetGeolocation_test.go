package nodes

import (
	"testing"
	"time"
)

func TestPositionFromPayload(t *testing.T) {
	now := time.Date(2026, 11, 27, 12, 0, 0, 0, time.UTC)
	p, ok := positionFromPayload(map[string]any{"latitude": 41.38, "longitude": 2.11, "timestamp": "2026-11-27T11:59:58.5Z"}, now)
	if !ok || p.Latitude != 41.38 || p.Longitude != 2.11 || !p.At.Equal(time.Date(2026, 11, 27, 11, 59, 58, 500000000, time.UTC)) {
		t.Fatalf("mobile geolocation: %+v %v", p, ok)
	}
	// the "Geolocation" sensor: Latitude, Longitude; numbers as text
	p, ok = positionFromPayload(map[string]any{"Latitude": "41.5", "Longitude": "-3.2", "accuracy": 12.0}, now)
	if !ok || p.Latitude != 41.5 || p.Longitude != -3.2 || p.Accuracy == nil || *p.Accuracy != 12 || !p.At.Equal(now) {
		t.Fatalf("geolocation: %+v %v", p, ok)
	}
	if s := p.state(); s["at"] != "2026-11-27T12:00:00Z" || s["accuracy"] != 12.0 {
		t.Fatalf("state: %v", s)
	}
	for _, bad := range []map[string]any{
		nil, {}, {"latitude": 91.0, "longitude": 0.0}, {"latitude": 0.0, "longitude": 181.0},
		{"latitude": "x", "longitude": 1.0}, {"latitude": 1.0}, {"temperature": 20.0},
	} {
		if _, ok := positionFromPayload(bad, now); ok {
			t.Fatalf("not a position: %v", bad)
		}
	}
}

func TestMetresBetween(t *testing.T) {
	a := geolocationPosition{Latitude: 41.0, Longitude: 2.0}
	b := geolocationPosition{Latitude: 41.0 + 1.0/111195.0*10, Longitude: 2.0}
	if d := metresBetween(a, b); d < 9.9 || d > 10.1 {
		t.Fatalf("10 m north: %v", d)
	}
}

func TestGeolocationThrottle(t *testing.T) {
	var th geolocationThrottle
	t0 := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	at := func(s float64) time.Time { return t0.Add(time.Duration(s * float64(time.Second))) }
	pos := func(metresNorth float64) geolocationPosition {
		return geolocationPosition{Latitude: 41 + metresNorth/111195.0, Longitude: 2}
	}
	if th.offer(pos(0), at(0)) == nil {
		t.Fatal("the first position is written")
	}
	if th.offer(pos(50), at(1)) != nil {
		t.Fatal("not before 5 s")
	}
	if th.due(at(3)) != nil {
		t.Fatal("kept until 5 s")
	}
	if p := th.due(at(5)); p == nil || p.Latitude != pos(50).Latitude {
		t.Fatal("the position kept is written at 5 s")
	}
	if th.due(at(6)) != nil {
		t.Fatal("written once")
	}
	if th.offer(pos(50.5), at(11)) != nil {
		t.Fatal("not moved: not written")
	}
	if th.due(at(30)) != nil {
		t.Fatal("not moved: nothing kept")
	}
	if th.offer(pos(51), at(66)) == nil {
		t.Fatal("refreshed after a minute")
	}
	if th.offer(pos(80), at(72)) == nil {
		t.Fatal("moved after 5 s: written")
	}
	th.forget()
	if th.offer(pos(80), at(73)) == nil {
		t.Fatal("after a failed write, the next one is written")
	}
}
