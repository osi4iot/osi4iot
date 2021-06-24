import {
	DigitalTwinsDispatch,
	IDigitalTwinsOptionToShow,
	IDigitalTwinIdToEdit,
	IDigitalTwinRowIndexToEdit
} from "./interfaces";


export function setDigitalTwinsOptionToShow(digitalTwinsDispatch: DigitalTwinsDispatch, data: IDigitalTwinsOptionToShow) {
	digitalTwinsDispatch({ type: "DIGITAL_TWINS_OPTION_TO_SHOW", payload: data });
}

export function setDigitalTwinIdToEdit(digitalTwinsDispatch: DigitalTwinsDispatch, data: IDigitalTwinIdToEdit) {
	digitalTwinsDispatch({ type: "DIGITAL_TWIN_ID_TO_EDIT", payload: data });
}

export function setDigitalTwinRowIndexToEdit(digitalTwinsDispatch: DigitalTwinsDispatch, data: IDigitalTwinRowIndexToEdit) {
	digitalTwinsDispatch({ type: "DIGITAL_TWIN_ROW_INDEX_TO_EDIT", payload: data });
}

