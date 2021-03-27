export default interface INotificationChannel {
	id: number;
	orgId: number;
	name: string;
	type: string;
	settings: string;
	created: string;
	updated: string;
	isDefault: boolean;
	frequency: number;
	sendReminder: boolean;
	disableResolveMessage: boolean;
	uid: string;
	secureSettings: string;
}