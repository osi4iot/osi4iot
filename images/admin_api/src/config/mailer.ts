import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
	host: 'smtp.gmail.com',
	port: 465,
	secure: true,
	pool: true,
	connectionTimeout: 30000,
	auth: {
		user: process.env.NOTIFICATIONS_EMAIL_USER,
		pass: process.env.NOTIFICATIONS_EMAIL_PASSWORD
	}
});

export default transporter;