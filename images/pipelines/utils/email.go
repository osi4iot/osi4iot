package utils

import (
	"fmt"
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
        .content { 
            white-space: pre-line; 
            line-height: 1.2;
        }
    </style>
</head>
<body>
    <div class="content">%s</div>
</body>
</html>`

func SendEmail(smtpServer, from, to, subject, body, username, password string) error {
	m := gomail.NewMessage()
	m.SetHeader("From", from)
	m.SetHeader("To", to)
	m.SetHeader("Subject", subject)
	htmlBody := fmt.Sprintf(htmlTemplate, strings.ReplaceAll(body, "&", "&amp;"))

	m.SetBody("text/html", htmlBody)

	d := gomail.NewDialer(smtpServer, 587, username, password)

	if err := d.DialAndSend(m); err != nil {
		return err
	}
	return nil
}
