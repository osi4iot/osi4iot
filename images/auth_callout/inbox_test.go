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

// The members subscribe to the changes of the asset states of the group;
// they are not a chat topic, so no user publishes a copy of them.
func TestAssetStateSubjects(t *testing.T) {
	if got := AssetStateSubjects("g1"); got != "assetstate.Group_g1.*" {
		t.Fatalf("subject: %s", got)
	}
	if copies := UserChatSubjects("someone", []string{AssetStateSubjects("g1")}); len(copies) != 0 {
		t.Fatalf("a user copy of the asset states: %v", copies)
	}
}

func TestPipelineLogSubjects(t *testing.T) {
	if got := PipelineLogSubjects("g1"); got != "dtmlog.Group_g1.*" {
		t.Fatalf("got %q", got)
	}
	// the denied subject is one of the group's topics: it must be the same pattern the Allow has
	found := false
	for _, topicType := range topicTypeArray {
		if topicType+".Group_g1.*" == PipelineLogSubjects("g1") {
			found = true
		}
	}
	if !found {
		t.Fatal("PipelineLogSubjects must match the group's dtmlog topics")
	}
}
