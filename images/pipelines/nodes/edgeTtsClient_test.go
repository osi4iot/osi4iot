package nodes

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"
)

// The tokens of edge-tts 7.3.1 (drm.generate_sec_ms_gec_v2) for these times; the first one is the example of
// rany2/edge-tts#492 (the 5-minute window starting 2026-10-13T10:40:00Z)
func TestEdgeTTSSecMsGecV2(t *testing.T) {
	cases := map[float64]string{
		1791888000:   "492D7694A183A45E-56E821F95D4579C5B7C7E33DC7303FF379EC36D510213555BBBB9EB17EF15876",
		1700000000:   "2CD23A2CA0B2595A-F3C846C370E05F9CC83ACC5F995C5F5D87A4D0F14CE8936A0F902E64099E38A2",
		1800000123.5: "99E54519B490BE5C-E162DB0977FBDCB9B86DD8148BF1BCDC3C0303176CE39852A42B415935C20654",
		1794400000:   "8BBA9E2EAAB37070-42720914045E2D94DD1FCCA47A1612405928866400779685B6BFAE8643DD4BDE",
		1762900000:   "F3570521C09CF8CD-00ED28C93A3AA48AD4DC1BF966684E46D09DD429F19209B62C64A30C98D6A3AB",
	}
	for unix, want := range cases {
		if got := edgeTTSSecMsGec(unix); got != want {
			t.Errorf("token(%v) = %s, want %s", unix, got, want)
		}
	}
	// the same token during the whole 5-minute window
	if edgeTTSSecMsGec(1791888000) != edgeTTSSecMsGec(1791888299.9) {
		t.Error("the token changes inside its 5-minute window")
	}
}

func TestEdgeTTSEscapeAndSplit(t *testing.T) {
	if got := edgeTTSEscape("a < b & c\x01"); got != "a &lt; b &amp; c " {
		t.Errorf("escape = %q", got)
	}
	text := strings.Repeat("palabra ", 1200) + "fin &amp; ñandú"
	pieces := edgeTTSSplit(text, 4096)
	if len(pieces) < 3 {
		t.Fatalf("pieces = %d", len(pieces))
	}
	joined := strings.Join(pieces, " ")
	if strings.Join(strings.Fields(joined), " ") != strings.Join(strings.Fields(text), " ") {
		t.Error("the pieces do not keep the text")
	}
	for _, p := range pieces {
		if len(p) > 4096 {
			t.Errorf("piece of %d bytes", len(p))
		}
	}
	// no space: cut inside the limit, never inside a UTF-8 character or an entity
	long := strings.Repeat("ñ", 3000) + "&amp;" + strings.Repeat("x", 3000)
	for _, p := range edgeTTSSplit(long, 4096) {
		if len(p) > 4096 || !strings.HasPrefix(p, "ñ") && !strings.HasPrefix(p, "&amp;") && !strings.HasPrefix(p, "x") {
			t.Errorf("bad piece start %q (%d bytes)", p[:8], len(p))
		}
	}
}

// Against the real service (needs internet): EDGE_TTS_LIVE=1 go test -run TestEdgeTTSLive -v ./nodes/
func TestEdgeTTSLive(t *testing.T) {
	if os.Getenv("EDGE_TTS_LIVE") == "" {
		t.Skip("set EDGE_TTS_LIVE=1 to call Microsoft's service")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	audio, err := edgeTTSSynthesize(ctx, "¡Hola! ¿En qué puedo ayudarte?", "es-ES-ElviraNeural")
	if err != nil {
		t.Fatal(err)
	}
	if len(audio) < 1000 {
		t.Fatalf("only %d bytes of audio", len(audio))
	}
	t.Logf("%d bytes of MP3", len(audio))
}
