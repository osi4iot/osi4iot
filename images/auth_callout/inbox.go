package main

import (
	"fmt"
	"strings"
)

// UserInboxPrefix is the prefix of the subjects where a platform user gets the
// replies to its NATS requests (nats.js connection option "inboxPrefix"). The
// frontend computes the same prefix (tools/natsInbox.ts).
//
// The login is encoded so that it is a single subject token and no two users
// share a prefix: letters, digits and "-" stay as they are; any other byte
// (".", "_", "@", accents...) becomes "_" plus its two hex digits. Without it,
// the prefix of user "a" ("_INBOX_U_a.>") would also match the replies of user
// "a.b".
func UserInboxPrefix(username string) string {
	return "_INBOX_U_" + UserSubjectToken(username)
}

// UserSubjectToken is a platform login as a single NATS subject token (see
// UserInboxPrefix). The decoding is in pipelines (utils.UserFromSubjectToken)
// and the encoding also in the frontend (tools/natsInbox.ts).
func UserSubjectToken(username string) string {
	var b strings.Builder
	for _, c := range []byte(username) {
		switch {
		case c >= 'a' && c <= 'z', c >= 'A' && c <= 'Z', c >= '0' && c <= '9', c == '-':
			b.WriteByte(c)
		default:
			b.WriteString(fmt.Sprintf("_%02x", c))
		}
	}
	return b.String()
}

// The chat of a digital twin (questions to its AI agent on sim2llm, and
// its history and charts asked for on sim2state) is personal: pipelines
// must know who asks, and a NATS message does not say who published it.
// So each user also gets its own copy of those two topics,
//
//	user.<UserSubjectToken(login)>.<topic subject>
//
// e.g. "user.rafael_2epacheco.sim2llm.Group_<uid>.Topic_<uid>", that only
// that user may publish to: pipelines takes the user from the subject, so
// nobody can ask as someone else. The answers go to the user's inbox
// (UserInboxPrefix), where only that user can subscribe.
const UserChatSubjectPrefix = "user"

// userChatTopicTypes are the topics with a per-user copy.
var userChatTopicTypes = []string{"sim2llm", "sim2state"}

// UserChatSubjects are the per-user copies of the chat subjects among
// subjects (the publish permissions of the user's groups, allowed or
// denied).
func UserChatSubjects(username string, subjects []string) []string {
	token := UserSubjectToken(username)
	var out []string
	for _, s := range subjects {
		for _, topicType := range userChatTopicTypes {
			if strings.HasPrefix(s, topicType+".") {
				out = append(out, UserChatSubjectPrefix+"."+token+"."+s)
				break
			}
		}
	}
	return out
}
