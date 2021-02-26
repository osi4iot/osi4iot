export default interface IUser {
    id: number;
    name: string;
    login: string;
    email: string;
    avatarUrl: string;
    isAdmin: boolean;
    isDisabled: boolean;
    lastSeenAt: string;
    lastSeenAtAge: string;
    authLabels: string[];
}