package nodes

// Client of Microsoft Edge's online text-to-speech service ("Read aloud"), used by the Text2Speech node in
// edge-tts mode. It follows the Python package edge-tts (github.com/rany2/edge-tts, 7.3.x).
//
// It replaces github.com/bytectlgo/edge-tts, which stopped working in October 2026: since then the service
// only accepts the v2 Sec-MS-GEC token (CS64 + SHA-256 digests of the 5-minute time window, version prefix "2-")
// and answers the v1 token (plain SHA-256, prefix "1-") with 403, which the library reported as
// "websocket: bad handshake". This client also escapes the text for the SSML, splits long texts as the service
// requires (4096 bytes per request) and, on a 403, corrects the clock from the server's Date and retries once.

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/binary"
	"encoding/hex"
	"errors"
	"fmt"
	"html"
	"math"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/gorilla/websocket"
)

const (
	edgeTTSBaseURL              = "speech.platform.bing.com/consumer/speech/synthesize/readaloud"
	edgeTTSTrustedClientToken   = "6A5AA1D4EAFF4E9FB37E23D68491D6F4"
	edgeTTSWSSURL               = "wss://" + edgeTTSBaseURL + "/edge/v1?TrustedClientToken=" + edgeTTSTrustedClientToken
	edgeTTSChromiumFullVersion  = "143.0.3650.75"
	edgeTTSChromiumMajorVersion = "143"
	// the prefix goes with the kind of token: "2-" for the v2 token
	edgeTTSSecMsGecVersion = "2-" + edgeTTSChromiumFullVersion
	edgeTTSOutputFormat    = "audio-24khz-48kbitrate-mono-mp3"
	// the most text (escaped, in bytes) of one request to the service
	edgeTTSMaxChunkBytes = 4096
	edgeTTSWinEpoch      = 11644473600
)

func edgeTTSHeaders() http.Header {
	h := http.Header{}
	h.Set("Pragma", "no-cache")
	h.Set("Cache-Control", "no-cache")
	h.Set("Origin", "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold")
	h.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/"+
		edgeTTSChromiumMajorVersion+".0.0.0 Safari/537.36 Edg/"+edgeTTSChromiumMajorVersion+".0.0.0")
	h.Set("Accept-Encoding", "gzip, deflate, br, zstd")
	h.Set("Accept-Language", "en-US,en;q=0.9")
	h.Set("Cookie", "muid="+edgeTTSRandomHex(16)+";")
	return h
}

func edgeTTSRandomHex(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return strings.ToUpper(hex.EncodeToString(b))
}

// ─── Clock ───────────────────────────────────────────────────────────────────

// The token depends on the time: a wrong clock gives a token the service rejects (403). Its Date corrects it.
var (
	edgeTTSClockSkewMu sync.Mutex
	edgeTTSClockSkew   float64
)

func edgeTTSUnixNow() float64 {
	edgeTTSClockSkewMu.Lock()
	defer edgeTTSClockSkewMu.Unlock()
	return float64(time.Now().UnixNano())/1e9 + edgeTTSClockSkew
}

func edgeTTSAdjustClock(resp *http.Response) bool {
	if resp == nil {
		return false
	}
	server, err := http.ParseTime(resp.Header.Get("Date"))
	if err != nil {
		return false
	}
	client := edgeTTSUnixNow()
	edgeTTSClockSkewMu.Lock()
	edgeTTSClockSkew += float64(server.UnixNano())/1e9 - client
	edgeTTSClockSkewMu.Unlock()
	return true
}

// ─── Sec-MS-GEC v2 token ─────────────────────────────────────────────────────
//
// "<16 hex>-<64 hex>": the CS64 digest and a SHA-256 digest (with a precomputed salt state) of
// "<Windows file time of the 5-minute window, in 100 ns ticks><trusted client token>". A port of drm.py of
// edge-tts 7.3.1; all arithmetic is modulo 2^32 (uint32).

var edgeSHA256Initial = [8]uint32{
	0x6A09E667, 0xBB67AE85, 0x3C6EF372, 0xA54FF53A, 0x510E527F, 0x9B05688C, 0x1F83D9AB, 0x5BE0CD19,
}

var edgeSHA256State = [8]uint32{
	0xFD9FBEA2, 0x91243CE7, 0xBE499094, 0xCD2E1E0A, 0x6C006F49, 0x04BD35AB, 0xFEB0A7E4, 0x03EFFBD2,
}

var edgeSHA256Schedule = [14]uint32{
	0xEB24BF9E, 0x1558691F, 0xA0C09EE2, 0x0CFA32BA, 0xA622EE8C, 0xD1DD9491, 0xC0DD25A0,
	0xF9E70AB6, 0xF0C31573, 0x7058CE4E, 0x7188E606, 0x00E5AB33, 0xD258B060, 0x72766564,
}

var edgeSHA256K = [64]uint32{
	0x428A2F98, 0x71374491, 0xB5C0FBCF, 0xE9B5DBA5, 0x3956C25B, 0x59F111F1, 0x923F82A4, 0xAB1C5ED5,
	0xD807AA98, 0x12835B01, 0x243185BE, 0x550C7DC3, 0x72BE5D74, 0x80DEB1FE, 0x9BDC06A7, 0xC19BF174,
	0xE49B69C1, 0xEFBE4786, 0x0FC19DC6, 0x240CA1CC, 0x2DE92C6F, 0x4A7484AA, 0x5CB0A9DC, 0x76F988DA,
	0x983E5152, 0xA831C66D, 0xB00327C8, 0xBF597FC7, 0xC6E00BF3, 0xD5A79147, 0x06CA6351, 0x14292967,
	0x27B70A85, 0x2E1B2138, 0x4D2C6DFC, 0x53380D13, 0x650A7354, 0x766A0ABB, 0x81C2C92E, 0x92722C85,
	0xA2BFE8A1, 0xA81A664B, 0xC24B8B70, 0xC76C51A3, 0xD192E819, 0xD6990624, 0xF40E3585, 0x106AA070,
	0x19A4C116, 0x1E376C08, 0x2748774C, 0x34B0BCB5, 0x391C0CB3, 0x4ED8AA4A, 0x5B9CCA4F, 0x682E6FF3,
	0x748F82EE, 0x78A5636F, 0x84C87814, 0x8CC70208, 0x90BEFFFA, 0xA4506CEB, 0xBEF9A3F7, 0xC67178F2,
}

const (
	edgeSHA256Adjustment       uint32 = 0xC9DC06A7
	edgeSHA256Sigma0Adjustment uint32 = 0x059C0B80
	edgeSHA256Sigma1Adjustment uint32 = 0x000B92C0
	edgeCS64Factor             uint32 = 0x82893933
	edgeCS64Adjustment0        uint32 = 0xF2F90B1A
	edgeCS64Adjustment1        uint32 = 0x0B1A0000
)

// the constants of the first block, which starts at round 14 (one constant changed)
var edgeSHA256BlockK = func() [64]uint32 {
	k := edgeSHA256K
	k[14] = edgeSHA256Adjustment
	return k
}()

var edgeCS64Coefficients = [14][2]uint32{
	{0xE82E91B1, 0xB32700D0}, {0x44DE24C6, 0x88DFF51D}, {0x3BEB65BC, 0x29514038}, {0xC89C5933, 0xB328CBDF},
	{0x8D1EC211, 0xD405B4D5}, {0x314EF5D5, 0x26E55F3C}, {0xE92491B1, 0x607801C6}, {0xF0A5B9D5, 0x82B2C1FB},
	{0x06064CF3, 0xFA51A3DA}, {0xDA79FA60, 0x207CC464}, {0xBED20560, 0x3C3C74F3}, {0x89F9C9F8, 0xD2D14B61},
	{0x35FA38C6, 0xBB04A2C1}, {0xCB49E3C6, 0xC5626167},
}

func rotr32(x uint32, n uint) uint32 { return x>>n | x<<(32-n) }
func rol16(x uint32) uint32          { return x<<16 | x>>16 }

func edgeSigma0(x uint32) uint32 { return rotr32(x, 7) ^ rotr32(x, 18) ^ x>>3 }
func edgeSigma1(x uint32) uint32 { return rotr32(x, 17) ^ rotr32(x, 19) ^ x>>10 }

func edgeExpandSchedule(w []uint32, first int) []uint32 {
	for i := first; i < 64; i++ {
		w = append(w, edgeSigma1(w[i-2])+w[i-7]+edgeSigma0(w[i-15])+w[i-16])
	}
	return w
}

// SHA-256 rounds from `first` (14 in the first block, whose first words are the salt's)
func edgeSHA256Rounds(state [8]uint32, w []uint32, first int) [8]uint32 {
	k := &edgeSHA256K
	if first == 14 {
		k = &edgeSHA256BlockK
	}
	a, b, c, d, e, f, g, h := state[0], state[1], state[2], state[3], state[4], state[5], state[6], state[7]
	for i := first; i < 64; i++ {
		t1 := h + (rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25)) + (g ^ (e & (f ^ g))) + k[i] + w[i]
		t2 := (rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22)) + ((a & b) | (c & (a | b)))
		a, b, c, d, e, f, g, h = t1+t2, a, b, c, d+t1, e, f, g
	}
	return [8]uint32{a, b, c, d, e, f, g, h}
}

// the state after the first block, from the first 7 bytes of the data
func edgeSHA256Init(data []byte) [8]uint32 {
	w := make([]uint32, 16, 64)
	w[14] = uint32(data[0])<<16 | uint32(data[1])<<8 | uint32(data[2])
	w[15] = binary.BigEndian.Uint32(data[3:7])
	for i := 16; i < 30; i++ {
		v := edgeSHA256Schedule[i-16]
		if i-2 >= 14 {
			s := edgeSigma1(w[i-2])
			if i == 16 {
				s ^= edgeSHA256Sigma1Adjustment
			}
			v += s
		}
		if i-7 >= 14 {
			v += w[i-7]
		}
		if i-15 >= 14 {
			s := edgeSigma0(w[i-15])
			if i == 29 {
				s ^= edgeSHA256Sigma0Adjustment
			}
			v += s
		}
		w = append(w, v)
	}
	w = append(w, edgeSigma1(w[28])+w[23]+edgeSigma0(w[15])+w[14]+edgeSHA256Adjustment-edgeSHA256K[14])
	w = edgeExpandSchedule(w, 31)
	working := edgeSHA256Rounds(edgeSHA256State, w, 14)
	var out [8]uint32
	for i := range out {
		out[i] = edgeSHA256Initial[i] + working[i]
	}
	return out
}

func edgeSHA256Digest(data []byte) []byte {
	length := 57 + len(data)
	padded := append([]byte{}, data[7:]...)
	padded = append(padded, 0x80)
	padded = append(padded, make([]byte, ((55-length)%64+64)%64)...)
	padded = binary.BigEndian.AppendUint64(padded, uint64(length)*8)
	state := edgeSHA256Init(data[:7])
	for off := 0; off < len(padded); off += 64 {
		w := make([]uint32, 16, 64)
		for i := range 16 {
			w[i] = binary.BigEndian.Uint32(padded[off+4*i:])
		}
		w = edgeExpandSchedule(w, 16)
		working := edgeSHA256Rounds(state, w, 0)
		for i := range state {
			state[i] += working[i]
		}
	}
	out := make([]byte, 0, 32)
	for _, v := range state {
		out = binary.BigEndian.AppendUint32(out, v)
	}
	return out
}

// little-endian 32-bit words, zero-padded to an even count
func edgeWordsLE4Even(data []byte) []uint32 {
	padded := append([]byte{}, data...)
	for len(padded)%4 != 0 {
		padded = append(padded, 0)
	}
	words := make([]uint32, 0, len(padded)/4+1)
	for i := 0; i < len(padded); i += 4 {
		words = append(words, binary.LittleEndian.Uint32(padded[i:]))
	}
	if len(words)%2 == 1 {
		words = append(words, 0)
	}
	return words
}

func edgeCS64Digest(data, digest []byte) (uint32, uint32) {
	keyA := binary.LittleEndian.Uint32(digest[0:4]) | 1
	keyB := binary.LittleEndian.Uint32(digest[4:8]) | 1
	factors := [2]uint32{keyA * edgeCS64Factor, keyB * edgeCS64Factor}
	terms := make([]uint32, 0, 64)
	offsets := make([]uint32, 0, 64)
	for i, c := range edgeCS64Coefficients {
		terms = append(terms, c[0]*factors[i%2])
		offsets = append(offsets, c[1])
	}
	for i, word := range edgeWordsLE4Even(append([]byte{0}, data...)) {
		var term, offset uint32
		if i%2 == 0 {
			term, offset = word*keyA, rol16(word)*0xEF0569FB
		} else {
			term, offset = word*keyB, rol16(word)*0xC31713DB
		}
		if i == 0 {
			term += edgeCS64Adjustment0 * factors[0]
			offset += edgeCS64Adjustment1
		}
		terms = append(terms, term)
		offsets = append(offsets, offset)
	}
	var swapAcc, swapLast, state, acc uint32
	for i := 0; i < len(terms); i += 2 {
		x, y := terms[i], terms[i+1]
		t := rol16(offsets[i] + x)
		q := t * 0x76F50F34
		swapAcc += rol16(q)*0xC3EFEA97 + q
		t = rol16(offsets[i+1] + y)
		q = t * 0x1881CE3C
		swapLast = rol16(q)*0x35BD1EC9 + q
		swapAcc += swapLast

		state = state*keyA + x
		state = rol16(state) * 0xCF98B111
		state = rol16(state) * 0x87085B9F
		state = rol16(state) * 0x12CEB96D
		state = rol16(state) * 0x257E1D83
		acc += state
		t = state*keyB + y
		t = rol16(t) * 0xA27416F5
		t = rol16(t) * 0xD38396FF
		state = rol16(rol16(t)*0x7C932B89) * 0xBFA49F69
		acc += state
	}
	return swapLast ^ state, swapAcc ^ acc
}

// edgeTTSSecMsGec is the v2 Sec-MS-GEC token for a time (Unix seconds)
func edgeTTSSecMsGec(unixSeconds float64) string {
	ticks := unixSeconds + edgeTTSWinEpoch
	ticks -= math.Mod(ticks, 300)
	ticks *= 1e9 / 100
	data := []byte(strconv.FormatFloat(ticks, 'f', 0, 64) + edgeTTSTrustedClientToken)
	digest := edgeSHA256Digest(data)
	lo, hi := edgeCS64Digest(data, digest)
	cs64 := make([]byte, 0, 8)
	cs64 = binary.LittleEndian.AppendUint32(cs64, lo)
	cs64 = binary.LittleEndian.AppendUint32(cs64, hi)
	return strings.ToUpper(hex.EncodeToString(cs64)) + "-" + strings.ToUpper(hex.EncodeToString(digest))
}

// ─── Text ────────────────────────────────────────────────────────────────────

// the text for the SSML: without the control characters the service rejects, and escaped
func edgeTTSEscape(text string) string {
	cleaned := strings.Map(func(r rune) rune {
		if (r >= 0 && r <= 8) || (r >= 11 && r <= 12) || (r >= 14 && r <= 31) {
			return ' '
		}
		return r
	}, text)
	return html.EscapeString(cleaned)
}

// splits the escaped text in pieces of at most `limit` bytes: at a newline or a space if there is one, never
// inside a UTF-8 character or an entity (&amp;)
func edgeTTSSplit(text string, limit int) []string {
	var out []string
	for len(text) > limit {
		cut := strings.LastIndexAny(text[:limit], "\n ")
		if cut <= 0 {
			cut = limit
			for cut > 0 && !utf8.RuneStart(text[cut]) {
				cut--
			}
		}
		// not inside an entity
		if amp := strings.LastIndexByte(text[:cut], '&'); amp >= 0 && !strings.Contains(text[amp:cut], ";") && amp > 0 {
			cut = amp
		}
		piece := strings.TrimSpace(text[:cut])
		if piece != "" {
			out = append(out, piece)
		}
		text = text[cut:]
	}
	if piece := strings.TrimSpace(text); piece != "" {
		out = append(out, piece)
	}
	return out
}

func edgeTTSDate() string {
	return time.Now().UTC().Format("Mon Jan 02 2006 15:04:05") + " GMT+0000 (Coordinated Universal Time)"
}

// ─── Synthesis ───────────────────────────────────────────────────────────────

var errEdgeTTSForbidden = errors.New("edge-tts: the service rejected the connection (403)")

// edgeTTSSynthesize returns the MP3 audio (24 kHz, 48 kbps, mono) of the text, read by the voice (ShortName,
// e.g. "es-ES-ElviraNeural")
func edgeTTSSynthesize(ctx context.Context, text, voice string) ([]byte, error) {
	var audio bytes.Buffer
	for _, piece := range edgeTTSSplit(edgeTTSEscape(text), edgeTTSMaxChunkBytes) {
		data, err := edgeTTSSynthesizePiece(ctx, piece, voice)
		if errors.Is(err, errEdgeTTSForbidden) {
			// probably a wrong clock: corrected from the answer, once
			data, err = edgeTTSSynthesizePiece(ctx, piece, voice)
		}
		if err != nil {
			return nil, err
		}
		audio.Write(data)
	}
	if audio.Len() == 0 {
		return nil, errors.New("edge-tts: no audio was received")
	}
	return audio.Bytes(), nil
}

func edgeTTSSynthesizePiece(ctx context.Context, escapedText, voice string) ([]byte, error) {
	dialer := websocket.Dialer{
		Proxy:             http.ProxyFromEnvironment,
		HandshakeTimeout:  10 * time.Second,
		EnableCompression: true,
	}
	url := fmt.Sprintf("%s&ConnectionId=%s&Sec-MS-GEC=%s&Sec-MS-GEC-Version=%s",
		edgeTTSWSSURL, strings.ToLower(edgeTTSRandomHex(16)), edgeTTSSecMsGec(edgeTTSUnixNow()), edgeTTSSecMsGecVersion)
	conn, resp, err := dialer.DialContext(ctx, url, edgeTTSHeaders())
	if err != nil {
		if resp != nil && resp.StatusCode == http.StatusForbidden {
			edgeTTSAdjustClock(resp)
			return nil, errEdgeTTSForbidden
		}
		if resp != nil {
			return nil, fmt.Errorf("edge-tts: connection failed (HTTP %d): %w", resp.StatusCode, err)
		}
		return nil, fmt.Errorf("edge-tts: connection failed: %w", err)
	}
	defer conn.Close()
	// the context ends the reading
	stop := context.AfterFunc(ctx, func() { _ = conn.SetReadDeadline(time.Now()) })
	defer stop()

	config := "X-Timestamp:" + edgeTTSDate() + "\r\n" +
		"Content-Type:application/json; charset=utf-8\r\n" +
		"Path:speech.config\r\n\r\n" +
		`{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"true","wordBoundaryEnabled":"false"},` +
		`"outputFormat":"` + edgeTTSOutputFormat + `"}}}}` + "\r\n"
	if err := conn.WriteMessage(websocket.TextMessage, []byte(config)); err != nil {
		return nil, fmt.Errorf("edge-tts: %w", err)
	}
	ssml := "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>" +
		"<voice name='" + voice + "'><prosody pitch='+0Hz' rate='+0%' volume='+0%'>" + escapedText +
		"</prosody></voice></speak>"
	request := "X-RequestId:" + strings.ToLower(edgeTTSRandomHex(16)) + "\r\n" +
		"Content-Type:application/ssml+xml\r\n" +
		"X-Timestamp:" + edgeTTSDate() + "Z\r\n" + // the "Z" is not a mistake (as Edge sends it)
		"Path:ssml\r\n\r\n" + ssml
	if err := conn.WriteMessage(websocket.TextMessage, []byte(request)); err != nil {
		return nil, fmt.Errorf("edge-tts: %w", err)
	}

	var audio bytes.Buffer
	for {
		kind, message, err := conn.ReadMessage()
		if err != nil {
			if ctx.Err() != nil {
				return nil, fmt.Errorf("edge-tts: %w", ctx.Err())
			}
			return nil, fmt.Errorf("edge-tts: %w", err)
		}
		switch kind {
		case websocket.TextMessage:
			head, _, _ := strings.Cut(string(message), "\r\n\r\n")
			if edgeTTSHeader(head, "Path") == "turn.end" {
				return audio.Bytes(), nil
			}
		case websocket.BinaryMessage:
			// two bytes with the length of the headers, the headers and the audio
			if len(message) < 2 {
				return nil, errors.New("edge-tts: binary message without header length")
			}
			headerLength := int(binary.BigEndian.Uint16(message[:2]))
			if 2+headerLength > len(message) {
				return nil, errors.New("edge-tts: header length greater than the message")
			}
			head := string(message[2 : 2+headerLength])
			if edgeTTSHeader(head, "Path") != "audio" {
				return nil, errors.New("edge-tts: binary message that is not audio")
			}
			data := message[2+headerLength:]
			contentType := edgeTTSHeader(head, "Content-Type")
			if contentType == "" {
				// the end of the stream comes without type and without data
				continue
			}
			if contentType != "audio/mpeg" {
				return nil, fmt.Errorf("edge-tts: unexpected audio type %q", contentType)
			}
			audio.Write(data)
		}
	}
}

func edgeTTSHeader(head, name string) string {
	for _, line := range strings.Split(head, "\r\n") {
		if key, value, ok := strings.Cut(line, ":"); ok && strings.EqualFold(strings.TrimSpace(key), name) {
			return strings.TrimSpace(value)
		}
	}
	return ""
}
