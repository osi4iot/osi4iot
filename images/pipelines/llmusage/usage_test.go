package llmusage

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestParseUsageProviders(t *testing.T) {
	cases := []struct {
		name string
		body string
		sse  bool
		want Usage
	}{
		{"openai", `{"model":"gpt-4o","usage":{"prompt_tokens":120,"completion_tokens":30,"prompt_tokens_details":{"cached_tokens":100},"completion_tokens_details":{"reasoning_tokens":10}}}`,
			false, Usage{InputTokens: 120, OutputTokens: 30, CacheReadTokens: 100, ReasoningTokens: 10, Model: "gpt-4o"}},
		{"anthropic", `{"model":"claude-x","usage":{"input_tokens":20,"cache_read_input_tokens":100,"cache_creation_input_tokens":5,"output_tokens":7}}`,
			false, Usage{InputTokens: 125, OutputTokens: 7, CacheReadTokens: 100, Model: "claude-x"}},
		{"gemini", `{"modelVersion":"gemini-2.5-flash","usageMetadata":{"promptTokenCount":50,"candidatesTokenCount":12,"thoughtsTokenCount":8,"cachedContentTokenCount":4}}`,
			false, Usage{InputTokens: 50, OutputTokens: 20, CacheReadTokens: 4, ReasoningTokens: 8, Model: "gemini-2.5-flash"}},
		{"ollama", `{"model":"llama3.1:8b","done":true,"prompt_eval_count":40,"eval_count":9}`,
			false, Usage{InputTokens: 40, OutputTokens: 9, Model: "llama3.1:8b"}},
		{"whisper", `{"text":"hola","usage":{"type":"duration","seconds":12.5}}`, false, Usage{AudioSeconds: 12.5}},
		{"not json", `RIFF....`, false, Usage{}},
		{"anthropic stream", "event: message_start\ndata: {\"type\":\"message_start\",\"message\":{\"model\":\"claude-x\",\"usage\":{\"input_tokens\":30,\"output_tokens\":1}}}\n\n" +
			"event: message_delta\ndata: {\"type\":\"message_delta\",\"usage\":{\"output_tokens\":44}}\n\n",
			true, Usage{InputTokens: 30, OutputTokens: 44, Model: "claude-x"}},
		{"openai stream", "data: {\"model\":\"gpt-4o\",\"choices\":[]}\n\ndata: {\"model\":\"gpt-4o\",\"usage\":{\"prompt_tokens\":9,\"completion_tokens\":3}}\n\ndata: [DONE]\n\n",
			true, Usage{InputTokens: 9, OutputTokens: 3, Model: "gpt-4o"}},
	}
	for _, c := range cases {
		if got := ParseUsage([]byte(c.body), c.sse); got != c.want {
			t.Errorf("%s: got %+v, want %+v", c.name, got, c.want)
		}
	}
}

func TestTransportCountsEveryRequestOfAnOperation(t *testing.T) {
	calls := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if r.URL.Path == "/fail" {
			w.WriteHeader(http.StatusTooManyRequests)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"model":"gpt-4o","usage":{"prompt_tokens":100,"completion_tokens":10}}`)
	}))
	defer srv.Close()

	client := Client(5 * time.Second)
	ctx, counter := WithCounter(context.Background())
	for _, p := range []string{"/ok", "/ok", "/fail"} {
		req, _ := http.NewRequestWithContext(ctx, http.MethodPost, srv.URL+p, strings.NewReader("{}"))
		resp, err := client.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		_, _ = io.ReadAll(resp.Body)
		resp.Body.Close()
	}
	got := counter.Usage()
	if got.Requests != 2 || got.InputTokens != 200 || got.OutputTokens != 20 || got.Model != "gpt-4o" || got.ProviderHost == "" {
		t.Fatalf("usage %+v", got)
	}

	// without a counter nothing is measured and the body is untouched
	resp, err := client.Get(srv.URL + "/ok")
	if err != nil {
		t.Fatal(err)
	}
	body, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	if !strings.Contains(string(body), "prompt_tokens") || calls != 4 {
		t.Fatalf("body %q calls %d", body, calls)
	}
}

func TestMeterSendsRequeuesAndNotifies(t *testing.T) {
	var mu sync.Mutex
	fail := true
	var sent []Record
	post := func(ctx context.Context, records []Record) ([]OrgStatus, error) {
		mu.Lock()
		defer mu.Unlock()
		if fail {
			return nil, context.DeadlineExceeded
		}
		sent = append(sent, records...)
		return []OrgStatus{{OrgID: 1, MonthTokens: 900, MonthlyTokenLimit: 1000, WarningPercent: 80, Notify: "warning"}, {OrgID: 2}}, nil
	}
	var notified []string
	m := &Meter{post: post, notify: func(s OrgStatus, subjects []string) {
		notified = append(notified, s.Notify)
		notified = append(notified, subjects...)
	}}
	m.Add(Attribution{OrgID: 1, Source: SourceAIAgent, LogSubject: "log.a"}, Usage{Requests: 2, InputTokens: 10})
	m.Add(Attribution{OrgID: 1, Source: SourceTranslator, LogSubject: "log.a"}, Usage{InputTokens: 5})
	m.Add(Attribution{OrgID: 2, Source: SourceText2Speech, LogSubject: "log.b"}, Usage{Characters: 40})
	m.Add(Attribution{OrgID: 2, Source: SourceText2Speech}, Usage{}) // nothing consumed: not kept
	m.Flush(context.Background())
	if len(sent) != 0 || len(m.pending) != 3 {
		t.Fatalf("after a failure: sent %d pending %d", len(sent), len(m.pending))
	}
	fail = false
	m.Flush(context.Background())
	if len(sent) != 3 || len(m.pending) != 0 {
		t.Fatalf("sent %d pending %d", len(sent), len(m.pending))
	}
	if sent[1].Requests != 1 || sent[0].Requests != 2 {
		t.Fatalf("requests %+v", sent)
	}
	if strings.Join(notified, ",") != "warning,log.a" {
		t.Fatalf("notified %v", notified)
	}
}
