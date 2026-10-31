// Package safehttp is the HTTP client of the code users write in the
// pipelines (the Function nodes' go.http): it reaches the internet, not the
// platform's inside.
//
// The pipelines' container is on the platform's internal networks (Docker
// Swarm overlays) and shares its loopback with the agents' endpoints, so a
// plain client would let a pipeline call admin_api, NATS, Garage, the
// databases' HTTP ports, the knowledge and agent data endpoints, or a
// cloud's metadata service (169.254.169.254) with the pipelines' network
// identity. This client refuses those destinations:
//
//   - loopback, private (10/8 — the Swarm overlays —, 172.16/12,
//     192.168/16, fc00::/7), link-local (169.254/16, fe80::/10), shared
//     address space (100.64/10), unspecified, multicast, broadcast and the
//     other reserved ranges, IPv4-mapped IPv6 included;
//   - schemes other than http and https.
//
// The address is checked when the connection is made, on the IP actually
// dialed (net.Dialer.Control), not on the URL's name: a public name that
// resolves to an internal address, or changes to one between a check and
// the connection (DNS rebinding), is refused too. Redirects go through the
// same check. Proxies from the environment are not used (the check would
// see the proxy's address, not the destination's).
//
// Exceptions (config.yaml, functionHttp): allowPrivateNetworks opens every
// internal address; allowedHosts lists the host names (exact, any port),
// IPs or CIDR ranges a pipeline may reach although they are internal.
package safehttp

import (
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/netip"
	"strings"
	"syscall"
	"time"
)

// Policy is what may be reached besides the internet.
type Policy struct {
	// AllowPrivateNetworks lets every internal address be reached (only
	// for a platform whose pipelines are trusted).
	AllowPrivateNetworks bool
	// AllowedHosts: host names ("sensors.example.local"), IPs
	// ("10.0.5.20") or CIDR ranges ("10.0.5.0/24") allowed although
	// internal.
	AllowedHosts []string
}

// ErrBlocked is the error of a refused destination.
var ErrBlocked = errors.New("destination not allowed for pipelines (internal address)")

var blockedRanges = mustPrefixes(
	"0.0.0.0/8",       // "this network"
	"10.0.0.0/8",      // private: the Swarm overlay networks
	"100.64.0.0/10",   // shared address space (CGNAT)
	"127.0.0.0/8",     // loopback
	"169.254.0.0/16",  // link-local: cloud metadata services
	"172.16.0.0/12",   // private (Docker bridges)
	"192.0.0.0/24",    // IETF protocol assignments
	"192.0.2.0/24",    // documentation
	"192.88.99.0/24",  // 6to4 relay
	"192.168.0.0/16",  // private
	"198.18.0.0/15",   // benchmarking
	"198.51.100.0/24", // documentation
	"203.0.113.0/24",  // documentation
	"224.0.0.0/4",     // multicast
	"240.0.0.0/4",     // reserved, broadcast
	"::/128",          // unspecified
	"::1/128",         // loopback
	"64:ff9b::/96",    // NAT64 (embeds IPv4 addresses)
	"64:ff9b:1::/48",  // local NAT64
	"100::/64",        // discard
	"2001::/23",       // IETF protocol assignments (Teredo…)
	"2001:db8::/32",   // documentation
	"2002::/16",       // 6to4 (embeds IPv4 addresses)
	"fc00::/7",        // unique local
	"fe80::/10",       // link-local
	"ff00::/8",        // multicast
)

func mustPrefixes(cidrs ...string) []netip.Prefix {
	out := make([]netip.Prefix, 0, len(cidrs))
	for _, c := range cidrs {
		out = append(out, netip.MustParsePrefix(c))
	}
	return out
}

// Blocked says whether an address is internal (an IPv4-mapped IPv6
// address counts as its IPv4 one).
func Blocked(ip netip.Addr) bool {
	ip = ip.Unmap()
	if !ip.IsValid() {
		return true
	}
	for _, p := range blockedRanges {
		if p.Contains(ip) {
			return true
		}
	}
	return false
}

type allowList struct {
	all      bool
	prefixes []netip.Prefix
	hosts    map[string]bool
}

func newAllowList(p Policy) (*allowList, error) {
	a := &allowList{all: p.AllowPrivateNetworks, hosts: map[string]bool{}}
	for _, raw := range p.AllowedHosts {
		entry := strings.ToLower(strings.TrimSpace(raw))
		if entry == "" {
			continue
		}
		if strings.Contains(entry, "/") {
			prefix, err := netip.ParsePrefix(entry)
			if err != nil {
				return nil, fmt.Errorf("functionHttp.allowedHosts: invalid CIDR %q", raw)
			}
			a.prefixes = append(a.prefixes, prefix.Masked())
			continue
		}
		if ip, err := netip.ParseAddr(entry); err == nil {
			a.prefixes = append(a.prefixes, netip.PrefixFrom(ip.Unmap(), ip.Unmap().BitLen()))
			continue
		}
		a.hosts[entry] = true
	}
	return a, nil
}

func (a *allowList) ipAllowed(ip netip.Addr) bool {
	if a.all || !Blocked(ip) {
		return true
	}
	ip = ip.Unmap()
	for _, p := range a.prefixes {
		if p.Contains(ip) {
			return true
		}
	}
	return false
}

// control refuses a connection to an address the policy does not allow.
func (a *allowList) control(network, address string, _ syscall.RawConn) error {
	host, _, err := net.SplitHostPort(address)
	if err != nil {
		return fmt.Errorf("%w: %s", ErrBlocked, address)
	}
	ip, err := netip.ParseAddr(host)
	if err != nil || !a.ipAllowed(ip) {
		return fmt.Errorf("%w: %s", ErrBlocked, host)
	}
	return nil
}

func newTransport(control func(string, string, syscall.RawConn) error) *http.Transport {
	dialer := &net.Dialer{Timeout: 10 * time.Second, KeepAlive: 30 * time.Second, Control: control}
	return &http.Transport{
		Proxy:                 nil, // see the package comment
		DialContext:           dialer.DialContext,
		ForceAttemptHTTP2:     true,
		MaxIdleConns:          50,
		IdleConnTimeout:       90 * time.Second,
		TLSHandshakeTimeout:   10 * time.Second,
		ResponseHeaderTimeout: 30 * time.Second,
		ExpectContinueTimeout: time.Second,
	}
}

// roundTripper checks the scheme, and lets the allowed host names through
// without the address check.
type roundTripper struct {
	guarded http.RoundTripper
	open    http.RoundTripper
	hosts   map[string]bool
}

func (rt *roundTripper) RoundTrip(req *http.Request) (*http.Response, error) {
	if req.URL == nil || (req.URL.Scheme != "http" && req.URL.Scheme != "https") {
		return nil, fmt.Errorf("%w: only http and https URLs", ErrBlocked)
	}
	if rt.hosts[strings.ToLower(req.URL.Hostname())] {
		return rt.open.RoundTrip(req)
	}
	return rt.guarded.RoundTrip(req)
}

// MaxRedirects bounds the redirects a request follows.
const MaxRedirects = 5

// NewClient returns a client that applies the policy, with a timeout for
// each whole request.
func NewClient(p Policy, timeout time.Duration) (*http.Client, error) {
	allow, err := newAllowList(p)
	if err != nil {
		return nil, err
	}
	var open http.RoundTripper = newTransport(nil)
	if len(allow.hosts) == 0 {
		open = nil
	}
	return &http.Client{
		Timeout: timeout,
		Transport: &roundTripper{
			guarded: newTransport(allow.control),
			open:    open,
			hosts:   allow.hosts,
		},
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= MaxRedirects {
				return fmt.Errorf("stopped after %d redirects", MaxRedirects)
			}
			return nil
		},
	}, nil
}

// IsBlocked says whether a request failed because of the policy.
func IsBlocked(err error) bool {
	return errors.Is(err, ErrBlocked)
}
