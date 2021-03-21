import transporter from "../../config/mailer";
import IMessage from "../../GrafanaApi/interfaces/Message";

const sendEmail = async (subject: string, mailTo: string[], bodyType: string, mailBody: string = "html"): Promise<IMessage> => {
	return new Promise((resolve, reject) => {
		let mailOptions;
		if (bodyType === "text") {
			mailOptions = {
				from: process.env.EMAIL_USER,
				to: mailTo,
				subject,
				text: mailBody
			};
		} else if (bodyType === "html") {
			mailOptions = {
				from: process.env.EMAIL_USER,
				to: mailTo,
				subject,
				html: mailBody
			};
		}
		transporter.sendMail(mailOptions, (error, info) => {
			if (error) {
				const message = `Mail not sended.  ${error}`;
				reject({ message });
			}
			else {
				const message = "Email sended successfully";
				resolve({ message });
			}
		});
	});

}

export default sendEmail;