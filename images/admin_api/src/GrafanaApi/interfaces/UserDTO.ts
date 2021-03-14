export default interface IUserDTO {
	name: string;
	email: string;
	login: string;
	password: string;
	OrgId?: number;
	roleInOrg?: string;
	telegramId?: string;
}
