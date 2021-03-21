import IEmailNotificationChannelSettings from "./EmailNotificationChannelSettings";
import IGrafanaNotificationChannelSettings from "./GrafanaNotificationChannelSettings";

export default interface INotificationChannel {
	id?: number;
	uid: string;
	name: string;
	type: string;
	isDefault: boolean;
	sendReminder: boolean;
	settings: (IGrafanaNotificationChannelSettings | IEmailNotificationChannelSettings);
	created?: string;
	updated?: string;
}