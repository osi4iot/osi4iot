package utils

import (
	"fmt"
	"html"
	"io"
	"strings"

	"gopkg.in/gomail.v2"
)

const htmlTemplate = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        body { 
            font-family: monospace; 
            font-size: 13px; 
            margin: 0; 
            padding: 10px;
            background: white;
            color: black;
        }
        .figure { margin-top: 16px; }
        .content { 
            white-space: pre-line; 
            line-height: 1.2;
        }
    </style>
</head>
<body>
    <div class="content">%s</div>%s
</body>
</html>`

func SendEmail(smtpServer, from, to, subject, body, username, password string) error {
	return SendEmailWithImages(smtpServer, from, to, subject, body, username, password, nil)
}

// EmailImage is an image shown in the body of an email, after the text
// (an AI agent chart, for example), with its title above it.
type EmailImage struct {
	FileName string // also its Content-ID: letters, digits, "_" and "-", and the extension
	Title    string
	Data     []byte
}

// SendEmailWithImages sends an HTML email whose body shows the images
// after the text. They go inline in the email (multipart/related,
// <img src="cid:...">), so they are seen without loading anything.
func SendEmailWithImages(smtpServer, from, to, subject, body, username, password string, images []EmailImage) error {
	m := newEmail(from, to, subject, body, images)

	d := gomail.NewDialer(smtpServer, 587, username, password)

	if err := d.DialAndSend(m); err != nil {
		return err
	}
	return nil
}

func newEmail(from, to, subject, body string, images []EmailImage) *gomail.Message {
	m := gomail.NewMessage()
	m.SetHeader("From", from)
	m.SetHeader("To", to)
	m.SetHeader("Subject", subject)

	var figures strings.Builder
	for _, img := range images {
		data := img.Data
		m.Embed(img.FileName, gomail.SetCopyFunc(func(w io.Writer) error {
			_, err := w.Write(data)
			return err
		}))
		figures.WriteString("\n    <div class=\"figure\">")
		if img.Title != "" {
			fmt.Fprintf(&figures, "<p><b>%s</b></p>", html.EscapeString(img.Title))
		}
		fmt.Fprintf(&figures, `<img src="cid:%s" alt="%s" style="max-width:100%%;height:auto">`,
			html.EscapeString(img.FileName), html.EscapeString(img.Title))
		figures.WriteString("</div>")
	}
	htmlBody := fmt.Sprintf(htmlTemplate, strings.ReplaceAll(body, "&", "&amp;"), figures.String())

	m.SetBody("text/html", htmlBody)
	return m
}
