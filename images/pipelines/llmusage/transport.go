package llmusage

import (
	"bufio"
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"
)

// At most this much of a response is kept to read its usage (the usage of a stream comes at its end, so
// a longer one keeps its last part).
const maxKeptBytes = 4 << 20

// Transport returns a RoundTripper that counts, in the Counter of each request's context (WithCounter),
// the successful responses and the tokens they report. Requests without a Counter pass through unchanged.
// base nil: http.DefaultTransport.
func Transport(base http.RoundTripper) http.RoundTripper {
	if base == nil {
		base = http.DefaultTransport
	}
	return &transport{base: base}
}

// Client is an HTTP client with Transport and the given timeout (0: none).
func Client(timeout time.Duration) *http.Client {
	return &http.Client{Transport: Transport(nil), Timeout: timeout}
}

type transport struct{ base http.RoundTripper }

func (t *transport) RoundTrip(req *http.Request) (*http.Response, error) {
	resp, err := t.base.RoundTrip(req)
	counter := counterFrom(req.Context())
	if err != nil || counter == nil || resp == nil || resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return resp, err
	}
	sse := strings.Contains(strings.ToLower(resp.Header.Get("Content-Type")), "event-stream")
	if resp.Body == nil || resp.Body == http.NoBody {
		counter.add(Usage{Requests: 1, ProviderHost: req.URL.Host})
		return resp, nil
	}
	resp.Body = &meteredBody{rc: resp.Body, counter: counter, host: req.URL.Host, sse: sse}
	return resp, nil
}

// meteredBody passes the body through and, at its end (EOF or Close), reads the usage of what it kept.
type meteredBody struct {
	rc      io.ReadCloser
	counter *Counter
	host    string
	sse     bool
	buf     bytes.Buffer
	// a JSON body larger than maxKeptBytes: only the request is counted
	overflow bool
	once     sync.Once
}

func (b *meteredBody) Read(p []byte) (int, error) {
	n, err := b.rc.Read(p)
	if n > 0 {
		b.keep(p[:n])
	}
	if err == io.EOF {
		b.finish()
	}
	return n, err
}

func (b *meteredBody) Close() error {
	b.finish()
	return b.rc.Close()
}

func (b *meteredBody) keep(p []byte) {
	if b.overflow {
		return
	}
	if b.buf.Len()+len(p) > maxKeptBytes {
		if !b.sse {
			// a JSON body this large is not an LLM answer worth parsing: only the request is counted
			b.overflow = true
			b.buf.Reset()
			return
		}
		// a stream: keep its end, where the usage is
		rest := b.buf.Bytes()
		drop := b.buf.Len() + len(p) - maxKeptBytes
		if drop > len(rest) {
			drop = len(rest)
		}
		tail := append([]byte(nil), rest[drop:]...)
		b.buf.Reset()
		b.buf.Write(tail)
	}
	b.buf.Write(p)
}

func (b *meteredBody) finish() {
	b.once.Do(func() {
		u := ParseUsage(b.buf.Bytes(), b.sse)
		u.Requests = 1
		u.ProviderHost = b.host
		b.counter.add(u)
		b.buf = bytes.Buffer{}
	})
}

// ParseUsage reads the usage reported in a provider's response: a JSON body or, with sse, a stream of
// "data: {...}" events (the largest value of each field is kept: streams report running totals).
func ParseUsage(data []byte, sse bool) Usage {
	if !sse {
		dec := json.NewDecoder(bytes.NewReader(data))
		dec.UseNumber()
		var obj map[string]any
		if err := dec.Decode(&obj); err != nil {
			return Usage{}
		}
		return fromObject(obj)
	}
	var total Usage
	scanner := bufio.NewScanner(bytes.NewReader(data))
	scanner.Buffer(make([]byte, 64<<10), maxKeptBytes)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if !strings.HasPrefix(line, "data:") {
			continue
		}
		payload := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		if payload == "" || payload == "[DONE]" {
			continue
		}
		dec := json.NewDecoder(strings.NewReader(payload))
		dec.UseNumber()
		var obj map[string]any
		if dec.Decode(&obj) != nil {
			continue
		}
		total = maxOf(total, fromObject(obj))
	}
	return total
}

func maxOf(a, b Usage) Usage {
	if b.InputTokens > a.InputTokens {
		a.InputTokens = b.InputTokens
	}
	if b.OutputTokens > a.OutputTokens {
		a.OutputTokens = b.OutputTokens
	}
	if b.CacheReadTokens > a.CacheReadTokens {
		a.CacheReadTokens = b.CacheReadTokens
	}
	if b.ReasoningTokens > a.ReasoningTokens {
		a.ReasoningTokens = b.ReasoningTokens
	}
	if b.AudioSeconds > a.AudioSeconds {
		a.AudioSeconds = b.AudioSeconds
	}
	if a.Model == "" {
		a.Model = b.Model
	}
	return a
}

// fromObject reads the usage fields of the providers' answers:
//   - OpenAI and compatible: usage.prompt_tokens / completion_tokens (+ prompt_tokens_details.cached_tokens,
//     completion_tokens_details.reasoning_tokens); Responses API and newer audio models: usage.input_tokens /
//     output_tokens (+ input_tokens_details, output_tokens_details); Whisper: usage.seconds.
//   - Anthropic: usage.input_tokens / output_tokens plus cache_read_input_tokens and cache_creation_input_tokens
//     (not included in input_tokens); in a stream, message.usage of message_start.
//   - Gemini: usageMetadata.promptTokenCount / candidatesTokenCount / thoughtsTokenCount / cachedContentTokenCount.
//   - Ollama: prompt_eval_count / eval_count.
func fromObject(obj map[string]any) Usage {
	var u Usage
	u.Model = str(obj["model"])
	if u.Model == "" {
		u.Model = str(obj["modelVersion"])
	}
	if msg, ok := obj["message"].(map[string]any); ok {
		inner := fromObject(msg)
		if inner.Model != "" && u.Model == "" {
			u.Model = inner.Model
		}
		u = maxOf(u, inner)
	}
	if usage, ok := obj["usage"].(map[string]any); ok {
		in := num(usage["prompt_tokens"])
		cache := num(path(usage, "prompt_tokens_details", "cached_tokens"))
		if in == 0 {
			anthropicCacheRead := num(usage["cache_read_input_tokens"])
			in = num(usage["input_tokens"]) + anthropicCacheRead + num(usage["cache_creation_input_tokens"])
			cache = anthropicCacheRead
			if cache == 0 {
				cache = num(path(usage, "input_tokens_details", "cached_tokens"))
			}
		}
		out := num(usage["completion_tokens"])
		if out == 0 {
			out = num(usage["output_tokens"])
		}
		reasoning := num(path(usage, "completion_tokens_details", "reasoning_tokens"))
		if reasoning == 0 {
			reasoning = num(path(usage, "output_tokens_details", "reasoning_tokens"))
		}
		u = maxOf(u, Usage{InputTokens: in, OutputTokens: out, CacheReadTokens: cache, ReasoningTokens: reasoning,
			AudioSeconds: float(usage["seconds"])})
	}
	if meta, ok := obj["usageMetadata"].(map[string]any); ok {
		thoughts := num(meta["thoughtsTokenCount"])
		u = maxOf(u, Usage{
			InputTokens:     num(meta["promptTokenCount"]),
			OutputTokens:    num(meta["candidatesTokenCount"]) + thoughts,
			CacheReadTokens: num(meta["cachedContentTokenCount"]),
			ReasoningTokens: thoughts,
		})
	}
	if _, ok := obj["eval_count"]; ok {
		u = maxOf(u, Usage{InputTokens: num(obj["prompt_eval_count"]), OutputTokens: num(obj["eval_count"])})
	}
	return u
}

func path(m map[string]any, keys ...string) any {
	var cur any = m
	for _, k := range keys {
		next, ok := cur.(map[string]any)
		if !ok {
			return nil
		}
		cur = next[k]
	}
	return cur
}

func num(v any) int64 {
	switch x := v.(type) {
	case json.Number:
		if i, err := x.Int64(); err == nil {
			return i
		}
		if f, err := x.Float64(); err == nil {
			return int64(f)
		}
	case float64:
		return int64(x)
	case int64:
		return x
	case int:
		return int64(x)
	}
	return 0
}

func float(v any) float64 {
	switch x := v.(type) {
	case json.Number:
		f, _ := x.Float64()
		return f
	case float64:
		return x
	}
	return 0
}

func str(v any) string {
	s, _ := v.(string)
	return s
}
