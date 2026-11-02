package utils

import "testing"

func TestUserSubjectToken(t *testing.T) {
	for in, want := range map[string]string{
		"dicapua":        "dicapua",
		"rafael.pacheco": "rafael_2epacheco",
		"a_b":            "a_5fb",
		"José":           "Jos_c3_a9",
		"x@y.com":        "x_40y_2ecom",
	} {
		got := UserSubjectToken(in)
		if got != want {
			t.Errorf("%q -> %q, want %q", in, got, want)
		}
		back, ok := UserFromSubjectToken(got)
		if !ok || back != in {
			t.Errorf("decode %q -> %q %v, want %q", got, back, ok, in)
		}
	}
	for _, bad := range []string{"", "a.b", "a_2", "a_zz", "a_61", "a_2E", "a*", ">"} {
		if u, ok := UserFromSubjectToken(bad); ok {
			t.Errorf("%q decoded as %q", bad, u)
		}
	}
}

func TestUserOfChatSubject(t *testing.T) {
	subject := "sim2llm.Group_g.Topic_t"
	if got := UserChatSubject("rafael.pacheco", subject); got != "user.rafael_2epacheco.sim2llm.Group_g.Topic_t" {
		t.Fatalf("UserChatSubject = %q", got)
	}
	if u, ok := UserOfChatSubject("user.rafael_2epacheco.sim2llm.Group_g.Topic_t", subject); !ok || u != "rafael.pacheco" {
		t.Errorf("got %q %v", u, ok)
	}
	for _, s := range []string{
		subject,
		"user.ana.sim2llm.Group_g.Topic_x",
		"user.ana.sim2state.Group_g.Topic_t",
		"user..sim2llm.Group_g.Topic_t",
		"users.ana.sim2llm.Group_g.Topic_t",
	} {
		if u, ok := UserOfChatSubject(s, subject); ok {
			t.Errorf("%q: user %q", s, u)
		}
	}
	if got := UserInboxSubject("ana", "llm2sim.Group_g.Topic_t"); got != "_INBOX_U_ana.llm2sim.Group_g.Topic_t" {
		t.Errorf("UserInboxSubject = %q", got)
	}
}
