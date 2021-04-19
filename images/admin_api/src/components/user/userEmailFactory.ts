import sendEmail from "../../utils/sendEmail";
import CreateUserDto from "./interfaces/User.dto";
import jwt from "jsonwebtoken";

export const sendUserRegistrationInvitationEmail = async (usersArray: CreateUserDto[]): Promise<void> => {
	const platformName = `${process.env.PLATFORM_NAME.replace(/_/g," ").toUpperCase()} PLATFORM`;
	const subject = `Invitation to register in the ${platformName}`;

	const userRegisterInvitationEmailQuery = [];
	for (let i = 0; i < usersArray.length; i++) {
		const mailTo = usersArray[i].email;
		const userFirstName = usersArray[i].firstName;
		const algorithm = process.env.JWT_ALGORITHM as jwt.Algorithm;
		const payload = {
			id: usersArray[i].id,
			email: usersArray[i].email,
			action: "registration"
		};
		const registrationToken = jwt.sign({ ...payload }, process.env.ACCESS_TOKEN_SECRET, {
			algorithm,
			expiresIn: parseInt(process.env.REGISTRATION_TOKEN_LIFETIME, 10)
		});
		const registrationLink = `https://${process.env.DOMAIN_NAME}/register?token=${registrationToken}`;

		let mailBody =
			`<p>Dear ${userFirstName},</p>
			<p>Welcome to the ${platformName}!!!</p>
			<p>To complete the registration process, you must fill in the form on the website that can be accessed by using the following link:</p>
			<div>
				<a href="${registrationLink}">${registrationLink}</a>
			</div>`;
		mailBody =
			`${mailBody}
			<br>
			<div>
				<p>Best regards.</p>
				<p>${platformName}</p>
			</div>`;
		userRegisterInvitationEmailQuery[i] = sendEmail(subject, [mailTo], "html", mailBody);
	}
	await Promise.all(userRegisterInvitationEmailQuery);
}
