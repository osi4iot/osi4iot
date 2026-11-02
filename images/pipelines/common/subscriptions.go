package common

import (
	"errors"

	"github.com/nats-io/nats.go"
)

// SubscriptionGroup is several NATS subscriptions that end together, such
// as the two of the sim2state topic of a digital twin: the topic itself
// and the per-user copies of it (utils.UserChatSubject).
type SubscriptionGroup struct {
	subs []*nats.Subscription
}

// NewSubscriptionGroup groups the subscriptions that are not nil; with
// none, it returns nil.
func NewSubscriptionGroup(subs ...*nats.Subscription) *SubscriptionGroup {
	g := &SubscriptionGroup{}
	for _, s := range subs {
		if s != nil {
			g.subs = append(g.subs, s)
		}
	}
	if len(g.subs) == 0 {
		return nil
	}
	return g
}

// Unsubscribe ends all the subscriptions of the group.
func (g *SubscriptionGroup) Unsubscribe() error {
	if g == nil {
		return nil
	}
	var errs []error
	for _, s := range g.subs {
		if err := s.Unsubscribe(); err != nil {
			errs = append(errs, err)
		}
	}
	return errors.Join(errs...)
}
