package message

import (
	"pipelines/common"
	"testing"
)

func TestSenderTravels(t *testing.T) {
	in := NewMessageFromPayload(map[string]any{"message": "hola", "userName": "eva"})
	in.SetSender(&common.Sender{User: "ana", Source: common.SenderSourceNats})
	if c := in.Clone(); c.GetSender() == nil || c.GetSender().User != "ana" {
		t.Fatalf("Clone lost the sender: %+v", c.GetSender())
	}
	out := NewMessageFromPayload(map[string]any{})
	common.InheritSender(in, out)
	if !out.GetSender().IsPlatformUser() || out.GetSender().User != "ana" {
		t.Fatalf("InheritSender: %+v", out.GetSender())
	}
	other := NewMessageFromPayload(map[string]any{})
	other.SetSender(&common.Sender{User: "telegram_chat_1", Source: common.SenderSourceTelegram})
	common.InheritSender(in, other)
	if other.GetSender().User != "telegram_chat_1" || other.GetSender().IsPlatformUser() {
		t.Fatalf("InheritSender replaced a sender: %+v", other.GetSender())
	}
	var none *common.Sender
	if none.IsPlatformUser() {
		t.Fatal("nil sender is a platform user")
	}
	if common.NewSubscriptionGroup(nil, nil) != nil {
		t.Fatal("empty group is not nil")
	}
	if err := (*common.SubscriptionGroup)(nil).Unsubscribe(); err != nil {
		t.Fatal(err)
	}
}
