import {
	TopicsDispatch,
	ITopicsOptionToShow,
	ITopicIdToEdit,
	ITopicRowIndexToEdit
} from "./interfaces";


export function setTopicsOptionToShow(topicsDispatch: TopicsDispatch, data: ITopicsOptionToShow) {
	topicsDispatch({ type: "TOPICS_OPTION_TO_SHOW", payload: data });
}

export function setTopicIdToEdit(topicsDispatch: TopicsDispatch, data: ITopicIdToEdit) {
	topicsDispatch({ type: "TOPIC_ID_TO_EDIT", payload: data });
}

export function setTopicRowIndexToEdit(topicsDispatch: TopicsDispatch, data: ITopicRowIndexToEdit) {
	topicsDispatch({ type: "TOPIC_ROW_INDEX_TO_EDIT", payload: data });
}

