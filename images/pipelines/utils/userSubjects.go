package utils

import (
	"fmt"
	"strings"
)

// Per-user NATS subjects of the chat of a digital twin. A NATS message
// does not say who published it, and a "userName" field in it is
// whatever the publisher wrote. So auth_callout (inbox.go) lets each
// platform user publish to its own copy of the sim2llm and sim2state
// topics of its groups,
//
//	user.<UserSubjectToken(login)>.<topic subject>
//
// and nobody else: pipelines takes the user from the subject. The
// answers go to the user's inbox (UserInboxSubject), the only place where
// only that user can subscribe. A platform administrator may publish to
// any subject, so it can still ask as another user.
const UserChatSubjectPrefix = "user"

// UserSubjectToken is a login as a single subject token: letters, digits
// and "-" stay; any other byte becomes "_" and its two hex digits (as
// auth_callout and the frontend, tools/natsInbox.ts, encode it).
func UserSubjectToken(userName string) string {
	var b strings.Builder
	for _, c := range []byte(userName) {
		switch {
		case c >= 'a' && c <= 'z', c >= 'A' && c <= 'Z', c >= '0' && c <= '9', c == '-':
			b.WriteByte(c)
		default:
			fmt.Fprintf(&b, "_%02x", c)
		}
	}
	return b.String()
}

// UserFromSubjectToken decodes UserSubjectToken; false for a token that
// UserSubjectToken can not give.
func UserFromSubjectToken(token string) (string, bool) {
	if token == "" {
		return "", false
	}
	var b []byte
	for i := 0; i < len(token); i++ {
		c := token[i]
		switch {
		case c >= 'a' && c <= 'z', c >= 'A' && c <= 'Z', c >= '0' && c <= '9', c == '-':
			b = append(b, c)
		case c == '_' && i+2 < len(token):
			var v byte
			if _, err := fmt.Sscanf(token[i+1:i+3], "%02x", &v); err != nil {
				return "", false
			}
			if v >= 'a' && v <= 'z' || v >= 'A' && v <= 'Z' || v >= '0' && v <= '9' || v == '-' {
				return "", false // would be written as is
			}
			if token[i+1:i+3] != fmt.Sprintf("%02x", v) {
				return "", false // only lower case hex digits
			}
			b = append(b, v)
			i += 2
		default:
			return "", false
		}
	}
	return string(b), true
}

// UserChatSubject is the user's copy of a topic subject.
func UserChatSubject(userName, subject string) string {
	return UserChatSubjectPrefix + "." + UserSubjectToken(userName) + "." + subject
}

// AllUsersChatSubject is the subscription to the copies of a topic
// subject of all the users.
func AllUsersChatSubject(subject string) string {
	return UserChatSubjectPrefix + ".*." + subject
}

// UserOfChatSubject is the user of a per-user subject of the topic
// subject ("", false for any other subject).
func UserOfChatSubject(msgSubject, subject string) (string, bool) {
	rest, ok := strings.CutPrefix(msgSubject, UserChatSubjectPrefix+".")
	if !ok {
		return "", false
	}
	token, topic, ok := strings.Cut(rest, ".")
	if !ok || topic != subject {
		return "", false
	}
	return UserFromSubjectToken(token)
}

// HasUserChatCopy says whether the topic subject has per-user copies:
// the sim2llm and sim2state topics.
func HasUserChatCopy(subject string) bool {
	return strings.HasPrefix(subject, "sim2llm.") || strings.HasPrefix(subject, "sim2state.")
}

// UserInboxSubject is where a user, and only that user, gets a message
// meant for it about a topic subject: in the user's NATS inbox
// ("_INBOX_U_<token>", the only one auth_callout lets the user read),
// e.g. "_INBOX_U_ana.state2sim.Group_g.Topic_t".
func UserInboxSubject(userName, subject string) string {
	return "_INBOX_U_" + UserSubjectToken(userName) + "." + subject
}

// IsUserPrivateTopic says whether the messages for a user about the
// topic subject go to its inbox: the AI agent answers (llm2sim) and the
// chat history (state2sim).
func IsUserPrivateTopic(subject string) bool {
	return strings.HasPrefix(subject, "llm2sim.") || strings.HasPrefix(subject, "state2sim.")
}
