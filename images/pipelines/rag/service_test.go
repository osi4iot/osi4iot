package rag

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"pipelines/config"
)

func TestGroupTokens(t *testing.T) {
	s := &Service{tokenKey: []byte("0123456789abcdef0123456789abcdef")}
	tok := s.GroupToken(3)
	if !s.validToken(3, tok) {
		t.Fatal("own token rejected")
	}
	if s.validToken(4, tok) {
		t.Fatal("token of group 3 accepted for group 4")
	}
	other := &Service{tokenKey: []byte("another key, another process....")}
	if other.validToken(3, tok) {
		t.Fatal("token from another process accepted")
	}

	// The handler refuses a token for another group before touching
	// the database (the store is nil here).
	req := httptest.NewRequest(http.MethodPost, "/v1/knowledge/search",
		strings.NewReader(`{"group_id":4,"token":"`+tok+`","query":"x"}`))
	rec := httptest.NewRecorder()
	s.handleSearch(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestSearchServerLoopbackOnly(t *testing.T) {
	for _, addr := range []string{"0.0.0.0:7071", "10.0.0.5:7071", ":7071"} {
		s := &Service{cfg: config.RagConfig{SearchAddr: addr}}
		if err := s.StartSearchServer(context.Background()); err == nil {
			t.Fatalf("%s accepted", addr)
		}
	}
}
