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
	var b strings.Builder
	b.WriteString("_INBOX_U_")
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
