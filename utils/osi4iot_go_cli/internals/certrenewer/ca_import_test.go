package certrenewer

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"errors"
	"math/big"
	"strings"
	"testing"
	"time"
)

type testCA struct {
	cert *x509.Certificate
	key  *rsa.PrivateKey
}

var serial int64

func issue(t *testing.T, tmpl *x509.Certificate, pub any, parent *testCA, selfKey *rsa.PrivateKey) *x509.Certificate {
	t.Helper()
	serial++
	tmpl.SerialNumber = big.NewInt(serial)
	parentCert, signer := tmpl, any(selfKey)
	if parent != nil {
		parentCert, signer = parent.cert, parent.key
	}
	der, err := x509.CreateCertificate(rand.Reader, tmpl, parentCert, pub, signer)
	if err != nil {
		t.Fatal(err)
	}
	c, err := x509.ParseCertificate(der)
	if err != nil {
		t.Fatal(err)
	}
	return c
}

func newCA(t *testing.T, name string, parent *testCA, now time.Time) *testCA {
	key, _ := rsa.GenerateKey(rand.Reader, 2048)
	tmpl := &x509.Certificate{
		Subject:               pkix.Name{CommonName: name},
		NotBefore:             now.Add(-time.Hour),
		NotAfter:              now.Add(10 * 365 * 24 * time.Hour),
		IsCA:                  true,
		BasicConstraintsValid: true,
		KeyUsage:              x509.KeyUsageCertSign,
	}
	return &testCA{cert: issue(t, tmpl, &key.PublicKey, parent, key), key: key}
}

func pemCerts(certs ...*x509.Certificate) []byte {
	var b strings.Builder
	for _, c := range certs {
		b.Write(pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: c.Raw}))
	}
	return []byte(b.String())
}

func TestPrepareCaCerts(t *testing.T) {
	now := time.Date(2026, 11, 27, 12, 0, 0, 0, time.UTC)
	// as HARICA: the old root, the new root signed by it (cross), the intermediate, the domain's
	oldRoot := newCA(t, "RootCA 2015", nil, now)
	newRoot := newCA(t, "Root CA 2021", nil, now)
	cross := issue(t, &x509.Certificate{
		Subject: pkix.Name{CommonName: "Root CA 2021"}, NotBefore: now.Add(-time.Hour), NotAfter: now.Add(5 * 365 * 24 * time.Hour),
		IsCA: true, BasicConstraintsValid: true, KeyUsage: x509.KeyUsageCertSign,
	}, &newRoot.key.PublicKey, oldRoot, nil)
	inter := newCA(t, "GEANT TLS RSA 1", newRoot, now)

	leafKey, _ := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	leaf := issue(t, &x509.Certificate{
		Subject: pkix.Name{CommonName: "iot.eebe.upc.edu"}, DNSNames: []string{"iot.eebe.upc.edu"},
		NotBefore: now.Add(-time.Hour), NotAfter: now.Add(365 * 24 * time.Hour),
	}, &leafKey.PublicKey, inter, nil)
	der, _ := x509.MarshalPKCS8PrivateKey(leafKey)
	keyPEM := pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: der})

	// the chain in the certificate file (the user's case)
	m, err := PrepareCaCerts("iot.eebe.upc.edu", keyPEM, pemCerts(leaf, inter.cert, cross), nil, now)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Count(m.Cert, "BEGIN CERTIFICATE") != 3 || strings.Count(m.Chain, "BEGIN CERTIFICATE") != 2 {
		t.Fatalf("served %d, chain %d", strings.Count(m.Cert, "BEGIN"), strings.Count(m.Chain, "BEGIN"))
	}
	if !m.NotAfter.Equal(leaf.NotAfter) || m.PrivateKey != string(keyPEM) {
		t.Fatal("expiry or key")
	}

	// the chain apart, with a root that signs itself: kept in the chain, not served
	m, err = PrepareCaCerts("iot.eebe.upc.edu", keyPEM, pemCerts(leaf), pemCerts(inter.cert, newRoot.cert), now)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Count(m.Cert, "BEGIN CERTIFICATE") != 2 || strings.Count(m.Chain, "BEGIN CERTIFICATE") != 2 {
		t.Fatalf("served %d, chain %d", strings.Count(m.Cert, "BEGIN"), strings.Count(m.Chain, "BEGIN"))
	}

	// what is refused
	otherKey, _ := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	otherDer, _ := x509.MarshalPKCS8PrivateKey(otherKey)
	otherPEM := pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: otherDer})
	cases := []struct {
		name      string
		domain    string
		key, cert []byte
		ca        []byte
		at        time.Time
		want      string
	}{
		{"only the domain's certificate", "iot.eebe.upc.edu", keyPEM, pemCerts(leaf), nil, now, "no CA certificates"},
		{"another key", "iot.eebe.upc.edu", otherPEM, pemCerts(leaf, inter.cert), nil, now, "does not match"},
		{"another domain", "otro.upc.edu", keyPEM, pemCerts(leaf, inter.cert), nil, now, "does not cover"},
		{"expired", "iot.eebe.upc.edu", keyPEM, pemCerts(leaf, inter.cert), nil, now.Add(400 * 24 * time.Hour), "expired"},
		{"not its CA", "iot.eebe.upc.edu", keyPEM, pemCerts(leaf), pemCerts(oldRoot.cert), now, "did not issue the certificate"},
		{"out of order", "iot.eebe.upc.edu", keyPEM, pemCerts(leaf, inter.cert, oldRoot.cert, cross), nil, now, "not in order"},
		{"no key", "iot.eebe.upc.edu", []byte("nothing"), pemCerts(leaf, inter.cert), nil, now, "no PEM private key"},
		{"encrypted key", "iot.eebe.upc.edu", []byte("-----BEGIN ENCRYPTED PRIVATE KEY-----\nAAAA\n-----END ENCRYPTED PRIVATE KEY-----\n"), pemCerts(leaf, inter.cert), nil, now, "encrypted"},
	}
	for _, c := range cases {
		_, err := PrepareCaCerts(c.domain, c.key, c.cert, c.ca, c.at)
		if err == nil || !strings.Contains(err.Error(), c.want) {
			t.Errorf("%s: %v", c.name, err)
		}
	}
	if _, err := PrepareCaCerts("iot.eebe.upc.edu", keyPEM, pemCerts(leaf), nil, now); !errors.Is(err, ErrNoChain) {
		t.Errorf("ErrNoChain: %v", err)
	}
}
