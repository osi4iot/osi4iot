import { PlatformAssistantDispatch, IUserRole, IPlatformOptionsToShow } from "./interfaces";

export function setUserRole(plaformAssistantDispatch: PlatformAssistantDispatch, data: IUserRole) {
	plaformAssistantDispatch({ type: 'USER_ROLE', payload: data });
}

export function setPlaformOptionsToShow(plaformAssistantDispatch: PlatformAssistantDispatch, data: IPlatformOptionsToShow) {
	plaformAssistantDispatch({ type: 'PLATFORM_OPTIONS_TO_SHOW', payload: data });
}

