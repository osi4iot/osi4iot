import { type NatsConnection, headers } from "@nats-io/nats-core";
import { sc } from "./Natsconnection";

export interface MobileGeolocationCallbacks {
    setIsSensorReadings: (reading: boolean) => void;
    setReadingProgress: (progress: number) => void;
    // the browser refused or could not get the position
    onError: (message: string) => void;
}

export interface MobileGeolocationReading {
    stop: () => void;
}

const describeError = (error: GeolocationPositionError): string => {
    switch (error.code) {
        case error.PERMISSION_DENIED:
            return "Location permission denied: allow it for this site in the browser settings";
        case error.POSITION_UNAVAILABLE:
            return "The position is not available (is the phone's location turned on?)";
        case error.TIMEOUT:
            return "The position could not be obtained in time";
        default:
            return error.message || "The position could not be obtained";
    }
};

// Sends the phone's position to natsSubject every samplingPeriod seconds for
// totalReadingTime seconds: { timestamp, longitude, latitude }, the
// measurements of the "Mobile geolocation" sensor type. The browser keeps
// the position updated (watchPosition) and the last one is sent at each
// tick, so a slow fix does not delay the series.
const ReadMobileGeolocation = (
    nc: NatsConnection,
    natsSubject: string,
    totalReadingTime: number,
    samplingPeriod: number,
    callbacks: MobileGeolocationCallbacks,
    geolocation: Geolocation | undefined = typeof navigator !== "undefined" ? navigator.geolocation : undefined,
    clock: { setInterval: typeof setInterval; clearInterval: typeof clearInterval } = {
        setInterval: (...args: Parameters<typeof setInterval>) => setInterval(...args),
        clearInterval: (id) => clearInterval(id),
    },
): MobileGeolocationReading => {
    const { setIsSensorReadings, setReadingProgress, onError } = callbacks;
    if (!geolocation) {
        onError("This browser cannot give the phone's position");
        return { stop: () => undefined };
    }

    const h = headers();
    h.set("Content-Type", "application/json");
    h.set("Json-Structure", "object");

    const totalReadings = Math.max(1, Math.floor(totalReadingTime / samplingPeriod));
    let sent = 0;
    let last: GeolocationPosition | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let stopped = false;
    let watchId: number | null = null;

    const stop = () => {
        if (stopped) return;
        stopped = true;
        if (watchId !== null) geolocation.clearWatch(watchId);
        if (timer !== null) clock.clearInterval(timer);
        setIsSensorReadings(false);
    };

    const send = () => {
        if (stopped || !last) return;
        const { longitude, latitude } = last.coords;
        const payload = { timestamp: new Date().toJSON(), longitude, latitude };
        nc.publish(natsSubject, sc.encode(JSON.stringify(payload)), { headers: h });
        sent++;
        setReadingProgress((sent / totalReadings) * 100);
        if (sent >= totalReadings) stop();
    };

    watchId = geolocation.watchPosition(
        (position) => {
            const first = last === null;
            last = position;
            if (first && !stopped) {
                // the first fix starts the series
                setIsSensorReadings(true);
                send();
                if (!stopped) timer = clock.setInterval(send, samplingPeriod * 1000);
            }
        },
        (error) => {
            onError(describeError(error));
            stop();
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 30_000 },
    );
    // stopped while starting (a browser that answers at once)
    if (stopped) geolocation.clearWatch(watchId);

    return { stop };
};

export default ReadMobileGeolocation;
