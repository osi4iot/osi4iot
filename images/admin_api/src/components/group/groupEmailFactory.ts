import sendEmail from "../../utils/sendEmail";
import IGroup from "./interfaces/Group.interface";
import CreateGroupAdminDto from "./interfaces/groupAdmin.dto";
import { getGroupMembers } from "./groupDAL";
import CreateGroupMemberDto from "./interfaces/groupMember.dto";
import { getOrganizationByProp } from "../organization/organizationDAL";

const informationToEditOrAdminHtml = (group: IGroup): string => {
	const groupHash = `Group_${group.groupUid}`;
	const tableHash = `Table_${group.groupUid}`;
	const emailNotifChannelName = `${group.acronym}_email_NC`;
	const telegramNotifChannelName = `${group.acronym}_telegram_NC`;

	const informationHtml =
		`<div>
			<p>In order to send and recover data of the platform, you have to use these secret identifications of the group:</p>
			<div style="padding:5px 15px;">
				<p><b>Group Hash:</b> ${groupHash}</p>
				<p><b>Table Hash:</b> ${tableHash}</p>
			</div>
			<p>You also have two notification channels to trigger alerts related with sensors data belongs to the group:</p>
			<div style="padding:5px 15px;">
				<p><b>Email nofitication channel:</b> ${emailNotifChannelName}</p>
				<p><b>Telegram nofitication channel:</b> ${telegramNotifChannelName}</p>
			</div>
		</div>`;
	return informationHtml;
}


export const sendGroupAdminInvitationEmail = async (orgName: string, group: IGroup, groupAdminDataArray: CreateGroupAdminDto[]): Promise<void> => {
	const platformName = `${process.env.PLATFORM_NAME.replace(/_/g, " ").toUpperCase()} PLATFORM`;
	let subject: string;
	if (group.isPrivate) {
		subject = `Invitation to be the administrator of the group "${group.name}"`;
	} else {
		subject = `Invitation to be the administrator of the organization "${orgName}"`;
	}

	const groupAdminInvitationEmailQuery = [];
	for (let i = 0; i < groupAdminDataArray.length; i++) {
		const mailTo = groupAdminDataArray[i].email;
		const groupAdminFirstName = groupAdminDataArray[i].firstName;
		let mailBody = `<p>Dear ${groupAdminFirstName},</p>`;
		if (group.isPrivate) {
			mailBody = `${mailBody}
			<p>Welcome to the group "${group.name}" of the organization "${orgName}" of the ${platformName}!!!</p>
			<p>You have been proposed to be the administrator of the group "${group.name}".</p>
			${informationToEditOrAdminHtml(group)}`;
		} else {
			mailBody = `${mailBody}
			<p>Welcome to the organization "${orgName}" of the ${platformName}!!!</p>
			<p>You have been proposed to be the administrator of the organization "${orgName}".</p>
			<p>One organization can have several groups but a group called "${group.name}" has been created automatically. You are also administrator of this group.</p>
			<p>You have to know that all the organization members have by default a "${group.folderPermission}" role in the group "${group.name}".</p>
			${informationToEditOrAdminHtml(group)}`;
		}
		if (group.telegramInvitationLink !== "" && group.telegramChatId !== "") {
			mailBody =
				`${mailBody}
				<div>
					<p>You can join to the group"s Telegram chat clicking in the following link:</p>
					<a href="${group.telegramInvitationLink}">${group.telegramInvitationLink}</a>
				</div>`;
		}
		mailBody =
			`${mailBody}
			<br>
			<div>
				<p>Best regards.</p>
				<p>${platformName}</p>
			</div>`;
		groupAdminInvitationEmailQuery[i] = sendEmail(subject, [mailTo], "html", mailBody);
	}
	await Promise.all(groupAdminInvitationEmailQuery);
}

export const sendGroupMemberInvitationEmail = async (group: IGroup, groupMemberArray: CreateGroupMemberDto[]): Promise<void> => {
	const subject = `Membership of the group "${group.name}"`;
	const platformName = `${process.env.PLATFORM_NAME.replace(/_/g," ").toUpperCase()} PLATFORM`;

	const groupMembershipEmailQuery = [];
	for (let i = 0; i < groupMemberArray.length; i++) {
		const mailTo = groupMemberArray[i].email;
		const memberFirstName = groupMemberArray[i].firstName;
		const roleInGroup = groupMemberArray[i].roleInGroup;
		let mailBody =
			`<p>Dear ${memberFirstName},</p>
			<p>Welcome to the group "${group.name}" of the ${platformName}!!!</p>
			<p>You are now member of the group "${group.name}" with "${roleInGroup}" role.</p>`;
		if (roleInGroup === "Editor") {
			mailBody =
				`${mailBody}
				${informationToEditOrAdminHtml(group)}`;
		}

		if (group.telegramInvitationLink !== "" && group.telegramChatId !== "") {
			mailBody =
				`${mailBody}
			<div>
				<p>You can join to the group"s Telegram chat clicking in the following link:</p>
				<a href = "${group.telegramInvitationLink}" > ${group.telegramInvitationLink} </a>
			</div>`;
		}
		mailBody =
			`${mailBody}
			<br>
			<div>
				<p>Best regards.</p>
				<p>${platformName}</p>
			</div>`;
		groupMembershipEmailQuery[i] = sendEmail(subject, [mailTo], "html", mailBody);
	}
	await Promise.all(groupMembershipEmailQuery);
}

export const sendRoleInGroupChangeInformationEmail = async (group: IGroup, groupMemberArray: CreateGroupMemberDto[]): Promise<void> => {
	const subject = `Information of change of the member role in the group "${group.name}"`;
	const platformName = `${process.env.PLATFORM_NAME.replace(/_/g," ").toUpperCase()} PLATFORM`;

	const groupRoleChangeEmailQuery = [];
	for (let i = 0; i < groupMemberArray.length; i++) {
		const mailTo = groupMemberArray[i].email;
		const memberFirstName = groupMemberArray[i].firstName;
		const roleInGroup = groupMemberArray[i].roleInGroup;
		let mailBody =
			`<p>Dear ${memberFirstName},</p>
			<p>Your role in the "${group.name}" group has been changed to "${roleInGroup}".</p>`;
		if (roleInGroup === "Editor" || roleInGroup === "Admin") {
			mailBody =
				`${mailBody}
				${informationToEditOrAdminHtml(group)}`;
		}
		mailBody =
			`${mailBody}
			<br>
			<div>
				<p>Best regards.</p>
				<p>${platformName}</p>
			</div>`;
		groupRoleChangeEmailQuery[i] = sendEmail(subject, [mailTo], "html", mailBody);
	}
	await Promise.all(groupRoleChangeEmailQuery);
}

export const sendChangeGroupDataInformationEmail = async (newGroupData: IGroup, oldGroupName: string): Promise<void> => {
	const subject = `Information of change of data in the group "${oldGroupName}"`;
	const platformName = `${process.env.PLATFORM_NAME.replace(/_/g," ").toUpperCase()} PLATFORM`;
	const groupMemberArray = await getGroupMembers(newGroupData);
	const groupChangeDataInformationEmailQuery = [];
	for (let i = 0; i < groupMemberArray.length; i++) {
		const mailTo = groupMemberArray[i].email;
		const memberFirstName = groupMemberArray[i].firstName;
		const roleInGroup = groupMemberArray[i].roleInGroup;
		let mailBody =
			`<p>Dear ${memberFirstName},</p>
			<p>We inform you that there have been changes in the data of the group: "${oldGroupName}":</p>
			<div style="padding:5px 15px;">
				<p>Group name: "${newGroupData.name}"</p>
				<p>Group acronym: "${newGroupData.acronym}"</p>
				<p>Telegram invitation link: <a href = "${newGroupData.telegramInvitationLink}">${newGroupData.telegramInvitationLink}</a></p>
			</div>`;
		if (roleInGroup === "Editor") {
			mailBody =
				`${mailBody}
				${informationToEditOrAdminHtml(newGroupData)}`;
		}
		mailBody =
			`${mailBody}
			<br>
			<div>
				<p>Best regards.</p>
				<p>${platformName}</p>
			</div>`;
		groupChangeDataInformationEmailQuery[i] = sendEmail(subject, [mailTo], "html", mailBody);
	}
	await Promise.all(groupChangeDataInformationEmailQuery);
}

export const sendRemoveGroupInformationEmail = async (group: IGroup, groupMembersToRemove: CreateGroupMemberDto[], removeOrgMembership: boolean = false): Promise<void> => {
	const subject = `Unsubscribed information from the "${group.name}" group`;
	const platformName = `${process.env.PLATFORM_NAME.replace(/_/g," ").toUpperCase()} PLATFORM`;
	const groupChangeDataInformationEmailQuery = [];
	let removeOrgComment = "";
	if (removeOrgMembership) {
		const organization = await getOrganizationByProp("id", group.orgId);
		removeOrgComment = ` and in the organization: "${organization.name}"`;
	}
	for (let i = 0; i < groupMembersToRemove.length; i++) {
		const mailTo = groupMembersToRemove[i].email;
		const memberFirstName = groupMembersToRemove[i].firstName;
		let mailBody =
			`<p>Dear ${memberFirstName},</p>
			<p>This cycle is over and your participation in the group: "${group.name}"${removeOrgComment} is no longer necessary.</p>
			<p>Thank you for your colaboration.</p>`;
		mailBody =
			`${mailBody}
			<br>
			<div>
				<p>Best regards.</p>
				<p>${platformName}</p>
			</div>`;
		groupChangeDataInformationEmailQuery[i] = sendEmail(subject, [mailTo], "html", mailBody);
	}
	await Promise.all(groupChangeDataInformationEmailQuery);
}