import { IDigitalTwinState } from "../GeolocationContainer";

export const STATUS_OK = "#62f700";
export const STATUS_ALERTING = "#ff4040";
export const STATUS_PENDING = "#f79520";

export const findOutStatus = (digitalTwinsState: IDigitalTwinState[]) => {
    let state = "ok";
    if (digitalTwinsState.length >= 1) {
        for (let i = 0; i < digitalTwinsState.length; i++) {
            if (digitalTwinsState[i].state === "alerting") {
                state = "alerting";
                break;
            } else if (digitalTwinsState[i].state === "pending") state = "pending";
        } 
    }
    return state;
};

export const defineImageColor = (state: string): string => {
    let imageColor = STATUS_OK;
    if (state === "pending") imageColor = STATUS_PENDING;
    else if (state === "alerting") imageColor = STATUS_ALERTING;
    return imageColor;
}