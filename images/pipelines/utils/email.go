package utils

import (
    "gopkg.in/gomail.v2"
)


func SendEmail(smtpServer, from, to, subject, body, username, password string) error {
    m := gomail.NewMessage()
    m.SetHeader("From", from)
    m.SetHeader("To", to)
    m.SetHeader("Subject", subject)
    m.SetBody("text/html", body)
    //m.Attach("archivo.pdf")

    d := gomail.NewDialer(smtpServer, 587, username, password)

    if err := d.DialAndSend(m); err != nil {
        return err
    }
	return nil
}