import nodemailer from "nodemailer";
import process_env from "./api_config";

const transporter = nodemailer.createTransport({
	host: 'smtp.gmail.com',
	port: 465,
	secure: true,
	pool: true,
	connectionTimeout: 30000,
	auth: {
		user: process_env.NOTIFICATIONS_EMAIL_USER,
		pass: process_env.NOTIFICATIONS_EMAIL_PASSWORD
	}
});

export default transporter;