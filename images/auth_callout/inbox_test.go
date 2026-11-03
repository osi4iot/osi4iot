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

func TestUserChatSubjects(t *testing.T) {
	got := UserChatSubjects("rafael.pacheco", []string{
		"sim2llm.Group_g1.*",
		"sim2state.Group_g1.*",
		"llm2sim.Group_g1.*",
		"dev2pdb.Group_g1.*",
		"sim2llmx.Group_g1.*",
		"sim2state.Group_g1.Topic_t1",
		"approval.Group_g1.*",
		"approvals.Group_g1.*",
	})
	want := []string{
		"user.rafael_2epacheco.sim2llm.Group_g1.*",
		"user.rafael_2epacheco.sim2state.Group_g1.*",
		"user.rafael_2epacheco.sim2state.Group_g1.Topic_t1",
		"user.rafael_2epacheco.approval.Group_g1.*",
	}
	if len(got) != len(want) {
		t.Fatalf("got %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("%d: %q, want %q", i, got[i], want[i])
		}
	}
}
