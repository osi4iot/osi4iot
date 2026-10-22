package llmagent

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"sync"

	"github.com/openai/openai-go/v2/option"

	"pipelines/logger"
)

// paramFixer adapts the chat requests of the OpenAI-compatible client to
// what each model accepts, learning it from the API's own errors.
//
// agent-sdk-go builds the request from a fixed list of "reasoning
// models" (o1, o3, o4, gpt-5): any other model gets temperature, top_p
// and no reasoning_effort. Newer models reject that. gpt-6-luna, for
// example, reasons by default and only takes function tools in
// /v1/chat/completions with reasoning_effort "none"; others take no
// temperature. Rather than keep a list of models, a 400 that names the
// parameter is fixed and the request sent again, once; the fix is then
// applied to every later request of that model.
type paramFixer struct {
	log *logger.Logger

	mu    sync.Mutex
	fixes map[string]modelFixes // by model
}

type modelFixes struct {
	reasoningNone bool // send reasoning_effort "none" (when there are tools)
	noTemperature bool
	noTopP        bool
}

func newParamFixer(log *logger.Logger) *paramFixer {
	return &paramFixer{log: log, fixes: map[string]modelFixes{}}
}

// middleware is an openai-go middleware for /chat/completions.
func (f *paramFixer) middleware() option.Middleware {
	return func(req *http.Request, next option.MiddlewareNext) (*http.Response, error) {
		if req.Method != http.MethodPost || !strings.HasSuffix(req.URL.Path, "/chat/completions") || req.Body == nil {
			return next(req)
		}
		raw, err := io.ReadAll(req.Body)
		_ = req.Body.Close()
		if err != nil {
			return nil, err
		}
		var body map[string]json.RawMessage
		if json.Unmarshal(raw, &body) != nil {
			return next(withBody(req, raw))
		}
		model := jsonString(body["model"])

		f.mu.Lock()
		fixes := f.fixes[model]
		f.mu.Unlock()
		// Each 400 can reveal one parameter: at most one retry per fix.
		for attempt := 0; ; attempt++ {
			resp, err := next(withBody(req, applyFixes(body, raw, fixes)))
			if err != nil || resp.StatusCode != http.StatusBadRequest || attempt == maxParamFixes {
				return resp, err
			}

			// A 400: is it a parameter we know how to fix?
			errBody, readErr := io.ReadAll(resp.Body)
			_ = resp.Body.Close()
			resp.Body = io.NopCloser(bytes.NewReader(errBody))
			if readErr != nil {
				return resp, nil
			}
			learned, ok := learnFix(string(errBody), fixes, hasTools(body))
			if !ok {
				return resp, nil
			}
			fixes = learned
			f.mu.Lock()
			f.fixes[model] = learned
			f.mu.Unlock()
			f.log.Warnf("AI agent: model %s rejected a parameter; sending the request again with %s (and from now on)", model, describeFixes(learned))
		}
	}
}

const maxParamFixes = 3

// learnFix reads an OpenAI error and returns the fixes with the new one.
func learnFix(errText string, known modelFixes, tools bool) (modelFixes, bool) {
	e := strings.ToLower(errText)
	next := known
	switch {
	case strings.Contains(e, "reasoning_effort") && tools && !known.reasoningNone:
		next.reasoningNone = true
	case strings.Contains(e, "temperature") && unsupported(e) && !known.noTemperature:
		next.noTemperature = true
	case strings.Contains(e, "top_p") && unsupported(e) && !known.noTopP:
		next.noTopP = true
	default:
		return known, false
	}
	return next, true
}

func unsupported(e string) bool {
	return strings.Contains(e, "unsupported") || strings.Contains(e, "not supported") || strings.Contains(e, "does not support")
}

func applyFixes(body map[string]json.RawMessage, raw []byte, fx modelFixes) []byte {
	if fx == (modelFixes{}) {
		return raw
	}
	out := make(map[string]json.RawMessage, len(body)+1)
	for k, v := range body {
		out[k] = v
	}
	if fx.reasoningNone && hasTools(body) {
		out["reasoning_effort"] = json.RawMessage(`"none"`)
	}
	if fx.noTemperature {
		delete(out, "temperature")
	}
	if fx.noTopP {
		delete(out, "top_p")
	}
	b, err := json.Marshal(out)
	if err != nil {
		return raw
	}
	return b
}

func hasTools(body map[string]json.RawMessage) bool {
	t, ok := body["tools"]
	return ok && len(t) > 2 // not null, not []
}

func describeFixes(fx modelFixes) string {
	var parts []string
	if fx.reasoningNone {
		parts = append(parts, `reasoning_effort "none" when using tools`)
	}
	if fx.noTemperature {
		parts = append(parts, "no temperature")
	}
	if fx.noTopP {
		parts = append(parts, "no top_p")
	}
	return strings.Join(parts, ", ")
}

func jsonString(raw json.RawMessage) string {
	var s string
	_ = json.Unmarshal(raw, &s)
	return s
}

func withBody(req *http.Request, body []byte) *http.Request {
	r := req.Clone(req.Context())
	r.Body = io.NopCloser(bytes.NewReader(body))
	r.ContentLength = int64(len(body))
	r.GetBody = func() (io.ReadCloser, error) { return io.NopCloser(bytes.NewReader(body)), nil }
	return r
}
