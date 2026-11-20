package utils

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

// Files attached to the chat of a digital twin: photos (of the phone, the computer or Telegram), documents of
// a moderate length (PDF, Word .docx, text .txt, Markdown .md) and tables (CSV, Excel .xlsx: the AI agent queries
// them with the chat_data MCP server, it does not read them whole).
//
// They are kept in the bucket, under the folder of the user who sent them:
//
//	org_data/org_<org>/group_<group>/chat_attachments/dt_<digitalTwin>/user_<hash of the login>/<YYYY-MM-DD>/<id>.<ext>
//
// A message of the chat (sim2llm) carries only "<YYYY-MM-DD>/<id>.<ext>" (ChatAttachment.File): the rest of the
// key is built here from the group, the digital twin and the user that pipelines knows (the sender of the
// message), so a message cannot point to the files of another user, digital twin or group. admin_api builds the
// same keys (components/chatAttachment/chatAttachmentDAL.ts): keep both in step.

// ChatAttachment is a file attached to a chat message, as the message and the stored conversation carry it.
type ChatAttachment struct {
	File     string `json:"file"`     // "<YYYY-MM-DD>/<id>.<ext>"
	Name     string `json:"name"`     // the name on the user's device, only shown
	MimeType string `json:"mimeType"` // image/jpeg, image/png, image/webp, application/pdf, …
	Size     int64  `json:"size"`
}

// MaxChatAttachments is the most attachments a message may carry (more are ignored).
const MaxChatAttachments = 4

// MaxChatAttachmentSize is the largest file read (as admin_api accepts); a text file, MaxChatTextAttachmentSize.
const MaxChatAttachmentSize = 10 * 1024 * 1024
const MaxChatTextAttachmentSize = 1024 * 1024

var chatAttachmentFileRe = regexp.MustCompile(`^(\d{4}-\d{2}-\d{2})/([A-Za-z0-9_-]{8,40})\.(jpg|png|webp|pdf|docx|txt|md|csv|xlsx)$`)

const (
	MimePDF  = "application/pdf"
	MimeDOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
	MimeText = "text/plain"
	MimeMD   = "text/markdown"
	MimeCSV  = "text/csv"
	MimeXLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
)

// chatAttachmentExtensions: the accepted types and the extension of their files
var chatAttachmentExtensions = map[string]string{
	"image/jpeg": "jpg",
	"image/png":  "png",
	"image/webp": "webp",
	MimePDF:      "pdf",
	MimeDOCX:     "docx",
	MimeText:     "txt",
	MimeMD:       "md",
	MimeCSV:      "csv",
	MimeXLSX:     "xlsx",
}

// ChatAttachmentExtension is the extension of the files of a type ("" when it is not accepted).
func ChatAttachmentExtension(mime string) string { return chatAttachmentExtensions[mime] }

// IsImageAttachment: a photo, read by the image model (else a document, whose text is extracted, or a table).
func IsImageAttachment(mime string) bool { return strings.HasPrefix(mime, "image/") }

// IsTableAttachment: a CSV or Excel table, queried by the chat_data MCP server.
func IsTableAttachment(mime string) bool { return mime == MimeCSV || mime == MimeXLSX }

// ValidChatAttachmentFile reports whether file is "<YYYY-MM-DD>/<id>.<ext>" of an accepted type.
func ValidChatAttachmentFile(file string) bool {
	return chatAttachmentFileRe.MatchString(file)
}

// ChatAttachmentUserFolder is the user's folder: "user_" and the first 24 hex characters of the SHA-256 of the
// login (as admin_api's chatAttachmentUserFolder), so that no login appears in the bucket.
func ChatAttachmentUserFolder(login string) string {
	sum := sha256.Sum256([]byte(login))
	return "user_" + hex.EncodeToString(sum[:])[:24]
}

// ChatAttachmentsDigitalTwinPrefix is the folder of the attachments of the chat of a digital twin (of all its
// users), with the final slash.
func ChatAttachmentsDigitalTwinPrefix(orgId, groupId, digitalTwinId int) string {
	return fmt.Sprintf("org_data/org_%d/group_%d/chat_attachments/dt_%d/", orgId, groupId, digitalTwinId)
}

// ChatAttachmentsUserPrefix is the folder of a user's attachments in the chat of a digital twin, with the
// final slash.
func ChatAttachmentsUserPrefix(orgId, groupId, digitalTwinId int, login string) string {
	return ChatAttachmentsDigitalTwinPrefix(orgId, groupId, digitalTwinId) + ChatAttachmentUserFolder(login) + "/"
}

// ChatAttachmentKey is the key of an attachment of a user, or an error when file is not a valid attachment name.
func ChatAttachmentKey(orgId, groupId, digitalTwinId int, login, file string) (string, error) {
	if login == "" {
		return "", fmt.Errorf("an attachment needs a user")
	}
	if !ValidChatAttachmentFile(file) {
		return "", fmt.Errorf("invalid attachment name %q", file)
	}
	return ChatAttachmentsUserPrefix(orgId, groupId, digitalTwinId, login) + file, nil
}

// ChatAttachmentTypeOf is the type of a file from its content and, for Word and text, the extension of its name
// ("" when it is not an accepted one). admin_api checks the same.
func ChatAttachmentTypeOf(data []byte, name string) string {
	if mime := ChatAttachmentType(data); mime != "" {
		return mime
	}
	if bytes.HasPrefix(data, []byte("%PDF-")) {
		return MimePDF
	}
	ext := strings.ToLower(name[strings.LastIndexByte(name, '.')+1:])
	switch {
	case ext == "docx" && bytes.HasPrefix(data, []byte("PK\x03\x04")) && bytes.Contains(data, []byte("word/document.xml")):
		return MimeDOCX
	case ext == "xlsx" && bytes.HasPrefix(data, []byte("PK\x03\x04")) && bytes.Contains(data, []byte("xl/workbook.xml")):
		return MimeXLSX
	case ext == "csv" && len(data) > 0 && !bytes.ContainsRune(data, 0):
		return MimeCSV // UTF-8, or Windows-1252 as Excel saves it in Spain: chat_data converts it
	case (ext == "txt" || ext == "md" || ext == "markdown") && utf8.Valid(data) && !bytes.ContainsRune(data, 0):
		if ext == "txt" {
			return MimeText
		}
		return MimeMD
	}
	return ""
}

// MaxChatAttachmentSizeOf is the largest file of a type.
func MaxChatAttachmentSizeOf(mime string) int {
	if strings.HasPrefix(mime, "text/") && mime != MimeCSV {
		return MaxChatTextAttachmentSize
	}
	return MaxChatAttachmentSize
}

// ChatAttachmentType is the type of an image from its first bytes ("" when it is not an accepted one).
func ChatAttachmentType(data []byte) string {
	switch {
	case len(data) >= 3 && data[0] == 0xff && data[1] == 0xd8 && data[2] == 0xff:
		return "image/jpeg"
	case len(data) >= 8 && bytes.Equal(data[:8], []byte{0x89, 'P', 'N', 'G', 0x0d, 0x0a, 0x1a, 0x0a}):
		return "image/png"
	case len(data) >= 12 && string(data[:4]) == "RIFF" && string(data[8:12]) == "WEBP":
		return "image/webp"
	}
	return ""
}

// ParseChatAttachments reads the "attachments" of a message: the valid ones, at most MaxChatAttachments.
func ParseChatAttachments(value any) []ChatAttachment {
	list, ok := value.([]any)
	if !ok {
		return nil
	}
	var out []ChatAttachment
	for _, item := range list {
		m, ok := item.(map[string]any)
		if !ok {
			continue
		}
		file, _ := m["file"].(string)
		if !ValidChatAttachmentFile(file) {
			continue
		}
		name, _ := m["name"].(string)
		mime, _ := m["mimeType"].(string)
		var size int64
		if s, ok := m["size"].(float64); ok && s > 0 {
			size = int64(s)
		}
		ext := file[strings.LastIndexByte(file, '.')+1:]
		if chatAttachmentExtensions[mime] != ext {
			// the type follows from the name: never trust another one
			for t, e := range chatAttachmentExtensions {
				if e == ext {
					mime = t
				}
			}
		}
		if len([]rune(name)) > 120 {
			name = string([]rune(name)[:120])
		}
		out = append(out, ChatAttachment{File: file, Name: name, MimeType: mime, Size: size})
		if len(out) == MaxChatAttachments {
			break
		}
	}
	return out
}

// PutChatAttachment stores a file of a user (e.g. a photo or a PDF sent to Telegram) as an attachment of the chat
// of a digital twin and returns it.
func PutChatAttachment(ctx context.Context, c *s3.Client, bucket string, orgId, groupId, digitalTwinId int,
	login, name string, data []byte) (ChatAttachment, error) {
	if c == nil || bucket == "" {
		return ChatAttachment{}, fmt.Errorf("no S3 bucket")
	}
	mime := ChatAttachmentTypeOf(data, name)
	if mime == "" {
		return ChatAttachment{}, fmt.Errorf("only images (JPEG, PNG, WebP) and documents (PDF, Word .docx, UTF-8 .txt or .md) and tables (CSV, Excel .xlsx) can be attached (got %s)", http.DetectContentType(data))
	}
	if len(data) == 0 || len(data) > MaxChatAttachmentSizeOf(mime) {
		return ChatAttachment{}, fmt.Errorf("the file is empty or larger than %d MB", MaxChatAttachmentSizeOf(mime)/(1024*1024))
	}
	id := make([]byte, 15)
	if _, err := rand.Read(id); err != nil {
		return ChatAttachment{}, err
	}
	file := fmt.Sprintf("%s/%s.%s", time.Now().UTC().Format("2006-01-02"), hex.EncodeToString(id), chatAttachmentExtensions[mime])
	key, err := ChatAttachmentKey(orgId, groupId, digitalTwinId, login, file)
	if err != nil {
		return ChatAttachment{}, err
	}
	if _, err := c.PutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(bucket),
		Key:         aws.String(key),
		Body:        bytes.NewReader(data),
		ContentType: aws.String(mime),
	}); err != nil {
		return ChatAttachment{}, fmt.Errorf("error uploading s3://%s/%s: %w", bucket, key, err)
	}
	if name == "" {
		kind := "document"
		if IsImageAttachment(mime) {
			kind = "image"
		}
		name = kind + "." + chatAttachmentExtensions[mime]
	}
	return ChatAttachment{File: file, Name: name, MimeType: mime, Size: int64(len(data))}, nil
}
