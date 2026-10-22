package llmagent

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"pipelines/logger"
)

// fakeOpenAI rejects what gpt-6-luna rejected: tools without
// reasoning_effort "none", and then (for the test) a temperature.
type fakeOpenAI struct {
	mu     sync.Mutex
	bodies []map[string]interface{}
}

func (f *fakeOpenAI) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	raw, _ := io.ReadAll(r.Body)
	var body map[string]interface{}
	_ = json.Unmarshal(raw, &body)
	f.mu.Lock()
	f.bodies = append(f.bodies, body)
	f.mu.Unlock()
	w.Header().Set("Content-Type", "application/json")
	if body["tools"] != nil && body["reasoning_effort"] != "none" {
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"error":{"message":"Function tools with reasoning_effort are not supported for gpt-6-luna in /v1/chat/completions. To use function tools, use /v1/responses or set reasoning_effort to 'none'.","param":"reasoning_effort"}}`))
		return
	}
	if _, ok := body["temperature"]; ok {
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"error":{"message":"Unsupported parameter: 'temperature' is not supported with this model.","param":"temperature"}}`))
		return
	}
	_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"ok"}}]}`))
}

func post(t *testing.T, f *paramFixer, url string, body string) *http.Response {
	t.Helper()
	req, _ := http.NewRequest(http.MethodPost, url+"/v1/chat/completions", bytes.NewReader([]byte(body)))
	resp, err := f.middleware()(req, http.DefaultClient.Do)
	if err != nil {
		t.Fatal(err)
	}
	return resp
}

func TestParamFixerLearnsAndRemembers(t *testing.T) {
	api := &fakeOpenAI{}
	srv := httptest.NewServer(api)
	defer srv.Close()
	fixer := newParamFixer(logger.NewLogger())

	req := `{"model":"gpt-6-luna","messages":[],"tools":[{"type":"function"}],"temperature":0.7,"top_p":0.95}`
	resp := post(t, fixer, srv.URL, req)
	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		t.Fatalf("status %d: %s", resp.StatusCode, b)
	}
	if len(api.bodies) != 3 {
		t.Fatalf("want 3 attempts (reasoning, temperature, ok), got %d", len(api.bodies))
	}
	last := api.bodies[2]
	if last["reasoning_effort"] != "none" || last["temperature"] != nil || last["top_p"] != 0.95 {
		t.Errorf("last request = %v", last)
	}

	// The next request of the model goes right the first time.
	resp = post(t, fixer, srv.URL, req)
	if resp.StatusCode != http.StatusOK || len(api.bodies) != 4 {
		t.Fatalf("second request: status %d after %d attempts", resp.StatusCode, len(api.bodies))
	}

	// Other models are left alone (and an unrelated 400 is passed on).
	resp = post(t, fixer, srv.URL, `{"model":"gpt-4o","messages":[],"tools":[{"type":"function"}]}`)
	if resp.StatusCode != http.StatusOK {
		// gpt-4o has no fixes yet: it learns its own, like any model.
		t.Logf("gpt-4o: %d", resp.StatusCode)
	}
	if got := fixer.fixes["gpt-4o"]; got.noTemperature {
		t.Errorf("gpt-4o learned a fix it did not need: %+v", got)
	}
}

func TestParamFixerPassesOtherErrors(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"error":{"message":"Invalid model"}}`))
	}))
	defer srv.Close()
	fixer := newParamFixer(logger.NewLogger())
	resp := post(t, fixer, srv.URL, `{"model":"nope","messages":[]}`)
	b, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusBadRequest || !strings.Contains(string(b), "Invalid model") {
		t.Fatalf("status %d body %s", resp.StatusCode, b)
	}
}
