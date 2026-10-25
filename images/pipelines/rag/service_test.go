package rag

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"pipelines/config"
)

func TestDigitalTwinTokens(t *testing.T) {
	s := &Service{tokenKey: []byte("0123456789abcdef0123456789abcdef")}
	tok := s.DigitalTwinToken(3, 7)
	if !s.validToken(3, 7, tok) {
		t.Fatal("own token rejected")
	}
	if s.validToken(3, 8, tok) {
		t.Fatal("token of digital twin 7 accepted for digital twin 8")
	}
	if s.validToken(4, 7, tok) {
		t.Fatal("token of group 3 accepted for group 4")
	}
	if s.validToken(37, 0, s.DigitalTwinToken(3, 70)) {
		t.Fatal("ids not separated in the token")
	}
	other := &Service{tokenKey: []byte("another key, another process....")}
	if other.validToken(3, 7, tok) {
		t.Fatal("token from another process accepted")
	}

	// The handlers refuse a token for another digital twin before
	// touching the database (the store is nil here).
	for path, handler := range map[string]http.HandlerFunc{
		"/v1/knowledge/search":    s.handleSearch,
		"/v1/knowledge/documents": s.handleDocuments,
	} {
		req := httptest.NewRequest(http.MethodPost, path,
			strings.NewReader(`{"group_id":3,"digital_twin_id":8,"token":"`+tok+`","query":"x"}`))
		rec := httptest.NewRecorder()
		handler(rec, req)
		if rec.Code != http.StatusForbidden {
			t.Fatalf("%s: got %d: %s", path, rec.Code, rec.Body.String())
		}
	}
}

// A group whose knowledge base is not enabled has no documents for its
// digital twins, without reaching the database (nil store here).
func TestDisabledGroupHasNoDocuments(t *testing.T) {
	s := &Service{}
	docs, err := s.DigitalTwinDocuments(context.Background(), 3, 7)
	if err != nil || docs != nil {
		t.Fatalf("got %v, %v", docs, err)
	}
	s.SetRAGPolicy(func(groupID int) bool { return groupID == 4 })
	if s.Enabled(3) || !s.Enabled(4) {
		t.Fatal("policy not applied")
	}
	if results, err := s.Search(context.Background(), 3, 7, "x", 5); err != nil || results != nil {
		t.Fatalf("got %v, %v", results, err)
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
