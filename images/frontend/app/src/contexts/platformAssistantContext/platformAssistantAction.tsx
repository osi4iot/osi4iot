import {
	PlatformAssistantDispatch,
	IUserRole,
	IPlatformAssistantOptionToShow
} from "./interfaces";

export function setUserRole(plaformAssistantDispatch: PlatformAssistantDispatch, data: IUserRole) {
	plaformAssistantDispatch({ type: 'USER_ROLE', payload: data });
}

export function setPlaformAssistantOptionToShow(plaformAssistantDispatch: PlatformAssistantDispatch, data: IPlatformAssistantOptionToShow) {
	plaformAssistantDispatch({ type: 'PLATFORM_ASSISTANT_OPTION_TO_SHOW', payload: data });
}

