package safehttp

import (
	"context"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"strings"
	"testing"
	"time"
)

func TestBlockedRanges(t *testing.T) {
	blocked := []string{
		"127.0.0.1", "127.0.0.11", "10.0.1.5", "172.18.0.3", "192.168.1.1", "169.254.169.254",
		"100.64.0.1", "0.0.0.0", "224.0.0.251", "255.255.255.255", "::1", "::", "fe80::1",
		"fd00::1", "::ffff:10.0.0.1", "::ffff:127.0.0.1", "64:ff9b::a00:1", "2002:a00:1::",
	}
	for _, s := range blocked {
		if !Blocked(netip.MustParseAddr(s)) {
			t.Errorf("%s should be blocked", s)
		}
	}
	for _, s := range []string{"8.8.8.8", "1.1.1.1", "93.184.216.34", "2606:4700:4700::1111", "::ffff:8.8.8.8"} {
		if Blocked(netip.MustParseAddr(s)) {
			t.Errorf("%s should be allowed", s)
		}
	}
}

func get(t *testing.T, c *http.Client, url string) (string, error) {
	t.Helper()
	resp, err := c.Get(url)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	return string(b), nil
}

func TestLocalServerIsBlockedUnlessAllowed(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { io.WriteString(w, "inside") }))
	defer srv.Close()
	port := srv.URL[strings.LastIndex(srv.URL, ":")+1:]

	c, _ := NewClient(Policy{}, 5*time.Second)
	for _, u := range []string{srv.URL, "http://localhost:" + port, "http://[::ffff:127.0.0.1]:" + port} {
		if _, err := get(t, c, u); !IsBlocked(err) {
			t.Errorf("%s: expected blocked, got %v", u, err)
		}
	}

	for _, p := range []Policy{
		{AllowedHosts: []string{"127.0.0.0/8"}},
		{AllowedHosts: []string{"127.0.0.1"}},
		{AllowedHosts: []string{"LOCALHOST"}},
		{AllowPrivateNetworks: true},
	} {
		c, err := NewClient(p, 5*time.Second)
		if err != nil {
			t.Fatal(err)
		}
		u := srv.URL
		if len(p.AllowedHosts) == 1 && p.AllowedHosts[0] == "LOCALHOST" {
			u = "http://localhost:" + port
		}
		if body, err := get(t, c, u); err != nil || body != "inside" {
			t.Errorf("%+v: expected allowed, got %q %v", p, body, err)
		}
	}
	// An allowed name does not open the other names of the same address.
	c, _ = NewClient(Policy{AllowedHosts: []string{"localhost"}}, 5*time.Second)
	if _, err := get(t, c, srv.URL); !IsBlocked(err) {
		t.Errorf("127.0.0.1 is not 'localhost': %v", err)
	}
}

func TestRedirectToInsideIsBlocked(t *testing.T) {
	inside := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { io.WriteString(w, "secret") }))
	defer inside.Close()
	// The "outside" server is allowed by name; it redirects inside.
	outside := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, inside.URL, http.StatusFound)
	}))
	defer outside.Close()
	port := outside.URL[strings.LastIndex(outside.URL, ":")+1:]
	c, _ := NewClient(Policy{AllowedHosts: []string{"localhost"}}, 5*time.Second)
	if _, err := get(t, c, "http://localhost:"+port); !IsBlocked(err) {
		t.Fatalf("the redirect to 127.0.0.1 must be blocked: %v", err)
	}
}

func TestPublicNameResolvingInsideIsBlocked(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { io.WriteString(w, "inside") }))
	defer srv.Close()
	port := srv.URL[strings.LastIndex(srv.URL, ":")+1:]
	c, _ := NewClient(Policy{}, 5*time.Second)
	// Make "public.example" resolve to 127.0.0.1, as a rebinding DNS would.
	tr := c.Transport.(*roundTripper).guarded.(*http.Transport)
	allow, _ := newAllowList(Policy{})
	dialer := &net.Dialer{Control: allow.control}
	tr.DialContext = func(ctx context.Context, network, addr string) (net.Conn, error) {
		return dialer.DialContext(ctx, network, "127.0.0.1:"+port)
	}
	if _, err := get(t, c, "http://public.example:"+port); !IsBlocked(err) {
		t.Fatalf("expected blocked, got %v", err)
	}
}

func TestOnlyHttp(t *testing.T) {
	c, _ := NewClient(Policy{AllowPrivateNetworks: true}, 5*time.Second)
	for _, u := range []string{"file:///etc/passwd", "ftp://example.com/x", "gopher://x"} {
		if _, err := get(t, c, u); err == nil {
			t.Errorf("%s accepted", u)
		}
	}
	if _, err := NewClient(Policy{AllowedHosts: []string{"10.0.0.0/33"}}, time.Second); err == nil {
		t.Error("invalid CIDR accepted")
	}
}
