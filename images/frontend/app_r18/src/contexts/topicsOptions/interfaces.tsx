export interface TopicsDispatch {
	(arg0: { type: string; payload?: any; error?: any }): void;
}

export interface TopicsContextProps {
	topicsOptionToShow: string;
	topicIdToEdit: number;
	topicRowIndexToEdit: number;
}

export interface TopicsActionPayload {
	topicsOptionToShow: string;
	topicIdToEdit: number;
	topicRowIndexToEdit: number;
}

export interface TopicsAction {
	type: string;
	payload: TopicsActionPayload;
	error: string;
}

export interface ITopicsOptionToShow {
	topicsOptionToShow: string;
}

export interface ITopicIdToEdit {
	topicIdToEdit: number;
}

export interface ITopicRowIndexToEdit {
	topicRowIndexToEdit: number;
}