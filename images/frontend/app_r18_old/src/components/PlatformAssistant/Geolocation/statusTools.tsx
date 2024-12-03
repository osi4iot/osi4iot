import { IDigitalTwinState, ISensorState } from "./GeolocationContainer";

export const STATUS_OK = "#62f700";
export const STATUS_ALERTING = "#ff4040";
export const STATUS_PENDING = "#f79520";


export const findOuDigitalTwinStatus = (digitalTwinState: IDigitalTwinState | null) => {
    let dtState = "ok";
    if (digitalTwinState) {
        if (digitalTwinState.state === "alerting") {
            dtState = "alerting"
        } else if (digitalTwinState.state === "no data" || digitalTwinState.state == null) {
            dtState = "ok";
        } else if (digitalTwinState.state === "pending") dtState = "pending";
    }
    return dtState;
}

export const findOutStatus = (digitalTwinsState: IDigitalTwinState[], sensorsState: ISensorState[]) => {
    let state = "ok";
    let dtState = "ok";
    for (let i = 0; i < digitalTwinsState.length; i++) {
        if (digitalTwinsState[i]) {
            if (digitalTwinsState[i].state === "alerting") {
                state = "alerting"
                break;
            } else if (
                digitalTwinsState[i].state === "ok" ||
                digitalTwinsState[i].state === "no data" ||
                digitalTwinsState[i].state == null
            ) {
                if (dtState !== "pending") dtState = "ok";
            } else if (digitalTwinsState[i].state === "pending") dtState = "pending";
        }
    }
    if (state === "alerting") return state;

    let sensorState = "ok";
    for (let i = 0; i < sensorsState.length; i++) {
        if (sensorsState[i]) {
            if (sensorsState[i].state === "alerting") {
                state = "alerting"
                break;
            } else if (
                sensorsState[i].state === "ok" ||
                sensorsState[i].state === "no data" ||
                sensorsState[i].state == null
            ) {
                if (sensorState !== "pending") sensorState = "ok";
            } else if (sensorsState[i].state === "pending") sensorState = "pending";
        }
    }
    if (state === "alerting") return state;
    if (dtState === "pending" || sensorState === "pending") return "pending";

    return state;
};

export const findOutSensorStatus = (sensorState: ISensorState) => {
    let state = "ok";
    if (sensorState) {
        if (sensorState.state === "alerting") {
            state = "alerting";
        } else if (sensorState.state === "no data" || sensorState.state == null) {
            state = "ok";
        } else if (sensorState.state === "pending") state = "pending";
    }

    return state;
};

export const defineImageColor = (state: string): string => {
    let imageColor = STATUS_OK;
    if (state === "pending") imageColor = STATUS_PENDING;
    else if (state === "alerting") imageColor = STATUS_ALERTING;
    return imageColor;
}