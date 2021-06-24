import { TopicsContextProps, TopicsAction } from "./interfaces";
import {
    TOPICS_OPTIONS
} from "../../components/PlatformAssistant/platformAssistantOptions";


export const initialState = {
    topicsOptionToShow: TOPICS_OPTIONS.TABLE,
    topicIdToEdit: 0,
    topicRowIndexToEdit: 0
};


export const TopicsReducer = (initialState: TopicsContextProps, action: TopicsAction) => {
    switch (action.type) {
        case "TOPICS_OPTION_TO_SHOW":
            return {
                ...initialState,
                topicsOptionToShow: action.payload.topicsOptionToShow
            };

        case "TOPIC_ID_TO_EDIT":
            return {
                ...initialState,
                topicIdToEdit: action.payload.topicIdToEdit
            };
        
        case "TOPIC_ROW_INDEX_TO_EDIT":
            return {
                ...initialState,
                topicRowIndexToEdit: action.payload.topicRowIndexToEdit
            };
        default:
            throw new Error(`Unhandled action type: ${action.type}`);
    }
};