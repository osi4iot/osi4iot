package main

import "testing"

func TestUserInboxPrefix(t *testing.T) {
	cases := map[string]string{
		"dicapua":        "_INBOX_U_dicapua",
		"rafael.pacheco": "_INBOX_U_rafael_2epacheco",
		"a_b":            "_INBOX_U_a_5fb",
		"José":           "_INBOX_U_Jos_c3_a9",
	}
	for in, want := range cases {
		if got := UserInboxPrefix(in); got != want {
			t.Errorf("%q -> %q, want %q", in, got, want)
		}
	}
}
