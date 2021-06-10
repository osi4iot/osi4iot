import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
	host: 'smtp.gmail.com',
	port: 465,
	secure: true,
	pool: true,
	maxConnections: 10,
	maxMessages: 200,
	connectionTimeout: 30000,
	auth: {
		user: process.env.EMAIL_USER,
		pass: process.env.EMAIL_PASSWORD
	}
});

export default transporter;