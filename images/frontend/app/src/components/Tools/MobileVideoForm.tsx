import { FC, useState, useRef, SyntheticEvent, useEffect, useCallback } from "react";
import { mobileSensorSettings, rememberMobileSensorSettings } from "../../tools/mobileSensors";
import { type NatsConnection, headers } from "@nats-io/nats-core";
import styled from "styled-components";
import { Formik, Form } from "formik";
import * as Yup from "yup";
import FormikControl from "./FormikControl";
import { IMobileTopic } from "../PlatformAssistant/TableColumns/topicsColumns";
import MobileSensorFormButtons from "./MobileSensorFormButtons";

// ---------------------------------------------------------------------------
// Styled components
// ---------------------------------------------------------------------------

const Title = styled.h2`
    font-size: 20px;
    margin-top: 30px;
    margin-bottom: 0px;
    font-weight: 400;
    text-align: center;
    color: white;
    width: 300px;
`;

interface ConnectionLedProps {
    readonly isNatsConnected: boolean;
}

const ConnectionLed = styled.span<ConnectionLedProps>`
    background-color: ${(props: { isNatsConnected: any; }) => (props.isNatsConnected ? "#62f700" : "#f80000")};
    width: 17px;
    height: 17px;
    margin: -2px 10px;
    border-radius: 50%;
    border: 2px solid #ffffff;
    display: inline-block;
`;

const FormContainer = styled.div`
    font-size: 12px;
    height: calc(100vh - 190px);
    position: relative;
    margin: 0 5px;
    color: white;
    margin: 10px 0;
    padding: 10px 12px 90px 12px;
    width: calc(100vw - 40px);
    max-width: 400px;
    border: 2px solid #3274d9;
    border-radius: 15px;

    form > div:nth-child(2) {
        margin-right: 10px;
    }
`;

const ControlsContainer = styled.div`
    height: calc(100vh - 280px);
    width: 100%;
    padding: 10px 5px;
    margin-bottom: 15px;
    overflow-y: auto;
    &::-webkit-scrollbar {
        width: 10px;
    }
    &::-webkit-scrollbar-track {
        background: #202226;
        border-radius: 5px;
    }
    &::-webkit-scrollbar-thumb {
        background: #2c3235;
        border-radius: 5px;
    }
    &::-webkit-scrollbar-thumb:hover {
        background-color: #343840;
    }
    div:first-child {
        margin-top: 0;
    }
    div:last-child {
        margin-bottom: 3px;
    }
`;

const StreamStats = styled.div<{ $warn: boolean }>`
    margin: 6px 0 4px;
    font-size: 12px;
    color: ${(p) => (p.$warn ? "#fbd38d" : "#9aa1aa")};
`;

const VideoPreview = styled.video`
    width: 100%;
    max-height: 180px;
    object-fit: cover;
    border-radius: 8px;
    margin-bottom: 10px;
    background-color: #0c0d0f;
`;

// Offscreen canvas used for frame capture — never added to the DOM
const offscreenCanvas = document.createElement("canvas");

// ---------------------------------------------------------------------------
// Types & constants
// ---------------------------------------------------------------------------

const FACING_MODES = {
    ENVIRONMENT: "environment",
    USER: "user",
} as const;

type FacingMode = (typeof FACING_MODES)[keyof typeof FACING_MODES];

interface MobileVideoFormProps {
    natsClient: NatsConnection;
    isNatsConnected: boolean;
    setMobileSensorSelected: React.Dispatch<React.SetStateAction<string>>;
    mobileTopicSelected: IMobileTopic;
}

// The frames are made smaller on the phone, before the JPEG: at most MAX_FRAME_SIDE pixels on their longest
// side. The camera often ignores the 640x480 asked for (an "ideal", not a must) and gives 1280x720, 1920x1080
// or more: such frames take long to encode on the phone, weigh several times more on the mobile uplink and
// cost the pipeline much more, while the YOLO models work at 640 anyway (no precision is lost).
export const MAX_FRAME_SIDE = 640;

// the size a frame is sent at: the camera's, scaled down to maxSide on its longest side (never up)
export const frameSize = (width: number, height: number, maxSide = MAX_FRAME_SIDE) => {
    const scale = Math.min(1, maxSide / Math.max(width, height));
    return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
};

const initialValues = {
    fps: 10,
    jpegQuality: 0.5,
    facingMode: FACING_MODES.ENVIRONMENT as FacingMode,
};

const validationSchema = Yup.object().shape({
    fps: Yup.number().min(1, "Minimum 1 fps").max(30, "Maximum 30 fps").required("Required"),
    jpegQuality: Yup.number()
        .min(0.1, "Minimum quality is 0.1")
        .max(1.0, "Maximum quality is 1.0")
        .required("Required"),
    facingMode: Yup.string().oneOf(Object.values(FACING_MODES)).required("Required"),
});

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const MobileVideoForm: FC<MobileVideoFormProps> = ({
    natsClient,
    isNatsConnected,
    setMobileSensorSelected,
    mobileTopicSelected,
}) => {
    const [isStreaming, setIsStreaming] = useState(false);
    // what really leaves the phone, measured every second: the frames per second sent, the size of a frame
    // and the time NATS takes to confirm it (a slow uplink shows up here, not as a delay in the pipeline)
    const [stats, setStats] = useState<{ fps: number; target: number; kb: number; rttMs: number; size: string } | null>(null);
    const statsTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Stop camera and interval on unmount
    useEffect(() => {
        return () => {
            stopStream();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const stopStream = useCallback(() => {
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
        if (statsTimerRef.current) {
            clearInterval(statsTimerRef.current);
            statsTimerRef.current = null;
        }
        setStats(null);
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((track: { stop: () => any; }) => track.stop());
            streamRef.current = null;
        }
        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }
        setIsStreaming(false);
    }, []);

    const onCancel = (e: SyntheticEvent) => {
        e.preventDefault();
        stopStream();
        setMobileSensorSelected("none");
    };

    const handleSubmit = async (values: typeof initialValues) => {
        rememberMobileSensorSettings(mobileTopicSelected, values);
        if (!natsClient || isStreaming || !mobileTopicSelected) return;

        // Request camera access
        let stream: MediaStream;
        try {
            stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: values.facingMode,
                    // Hint at a reasonable resolution to keep frame sizes manageable
                    width: { ideal: 640 },
                    height: { ideal: 480 },
                },
                audio: false,
            });
        } catch (err) {
            console.error("Camera access denied:", err);
            return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
            videoRef.current.srcObject = stream;
            await videoRef.current.play();
        }

        const groupHash = mobileTopicSelected.groupUid;
        const topicHash = mobileTopicSelected.topicUid;
        const natsSubject = `dev2dtm.Group_${groupHash}.Topic_${topicHash}`;

        const fps = Number(values.fps);
        const jpegQuality = Number(values.jpegQuality);
        const intervalMs = Math.round(1000 / fps);

        setIsStreaming(true);

        let busy = false;
        let seq = 0;
        const ctx = offscreenCanvas.getContext("2d");
        // frames sent, bytes and confirmation times since the last stats update
        let sent = 0;
        let bytes = 0;
        let rttSum = 0;
        let size = "";
        let lastStats = Date.now();
        statsTimerRef.current = setInterval(() => {
            const now = Date.now();
            const seconds = (now - lastStats) / 1000;
            lastStats = now;
            setStats({
                fps: sent / seconds,
                target: fps,
                kb: sent ? bytes / sent / 1024 : 0,
                rttMs: sent ? rttSum / sent : 0,
                size,
            });
            sent = 0;
            bytes = 0;
            rttSum = 0;
        }, 1000);

        intervalRef.current = setInterval(() => {
            const video = videoRef.current;
            if (busy || !ctx || !video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;

            const w = video.videoWidth;
            const h = video.videoHeight;
            if (w === 0 || h === 0) return;

            // the frame, scaled down on the phone (MAX_FRAME_SIDE)
            const out = frameSize(w, h);
            if (offscreenCanvas.width !== out.width || offscreenCanvas.height !== out.height) {
                offscreenCanvas.width = out.width;
                offscreenCanvas.height = out.height;
            }
            ctx.drawImage(video, 0, 0, out.width, out.height);
            size = out.width === w && out.height === h ? `${w}×${h}` : `camera ${w}×${h} → sent ${out.width}×${out.height}`;

            busy = true;
            const capturedAt = Date.now();
            offscreenCanvas.toBlob(
                async (blob) => {
                    try {
                        if (!blob || !natsClient) return;
                        const imageBytes = new Uint8Array(await blob.arrayBuffer());

                        const hdrs = headers();
                        hdrs.set("Content-Type", "image/jpeg");
                        hdrs.set("X-Frame-Seq", String(seq++));
                        hdrs.set("X-Capture-Ts", String(capturedAt));

                        const sentAt = performance.now();
                        natsClient.publish(natsSubject, imageBytes, { headers: hdrs });
                        // Wait for NATS to confirm it before taking the next frame. Without it, with an uplink slower
                        // than the video, the frames pile up in the phone's connection and reach the pipeline later and
                        // later (seconds behind); now the frames that do not fit are not taken, and each one that
                        // arrives is recent.
                        await natsClient.flush();
                        sent += 1;
                        bytes += imageBytes.length;
                        rttSum += performance.now() - sentAt;
                    } catch (err) {
                        console.warn("Video frame not sent:", err);
                    } finally {
                        busy = false;
                    }
                },
                "image/jpeg",
                jpegQuality,
            );
        }, intervalMs);
    };

    return (
        <>
            <Title>
                Mobile video <ConnectionLed isNatsConnected={isNatsConnected} />
            </Title>
            <FormContainer>
                <Formik initialValues={mobileSensorSettings(mobileTopicSelected, initialValues)} validationSchema={validationSchema} onSubmit={handleSubmit}>
                    {(formik: { isValid: any; }) => (
                        // @ts-ignore
                        <Form>
                            <ControlsContainer>
                                {/* Live preview — visible once streaming starts */}
                                <VideoPreview
                                    ref={videoRef}
                                    muted
                                    playsInline
                                    style={{ display: isStreaming ? "block" : "none" }}
                                />
                                {isStreaming && stats && (
                                    <StreamStats role="status" $warn={stats.fps < stats.target * 0.7}>
                                        Sending {stats.fps.toFixed(1)} of {stats.target} fps · {stats.kb.toFixed(0)} KB per frame ·
                                        confirmed in {stats.rttMs.toFixed(0)} ms{stats.size ? ` · ${stats.size}` : ""}
                                        {stats.fps < stats.target * 0.7 &&
                                            (stats.rttMs > 1000 / stats.target
                                                ? " — the connection does not keep up: lower the JPEG quality or the fps"
                                                : " — keep this page on screen: the browser slows the camera down in the background")}
                                    </StreamStats>
                                )}
                                <FormikControl
                                    control="select"
                                    label="Camera"
                                    name="facingMode"
                                    type="text"
                                    options={[
                                        { label: "Rear camera", value: FACING_MODES.ENVIRONMENT },
                                        { label: "Front camera", value: FACING_MODES.USER },
                                    ]}
                                />
                                <FormikControl
                                    control="input"
                                    label="Frames per second (1 – 30)"
                                    name="fps"
                                    type="text"
                                />
                                <FormikControl
                                    control="input"
                                    label="JPEG quality (0.01 – 1.0)"
                                    name="jpegQuality"
                                    type="text"
                                />
                            </ControlsContainer>
                            <MobileSensorFormButtons
                                onCancel={onCancel}
                                isValid={formik.isValid}
                                isSensorReading={isStreaming}
                            />
                        </Form>
                    )}
                </Formik>
            </FormContainer>
        </>
    );
};

export default MobileVideoForm;
