import { FC, useState, useRef, SyntheticEvent, useEffect, useCallback } from "react";
import { NatsConnection, headers } from "nats.ws";
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
    background-color: ${(props) => (props.isNatsConnected ? "#62f700" : "#f80000")};
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
    ::-webkit-scrollbar {
        width: 10px;
    }
    ::-webkit-scrollbar-track {
        background: #202226;
        border-radius: 5px;
    }
    ::-webkit-scrollbar-thumb {
        background: #2c3235;
        border-radius: 5px;
    }
    ::-webkit-scrollbar-thumb:hover {
        background-color: #343840;
    }
    div:first-child {
        margin-top: 0;
    }
    div:last-child {
        margin-bottom: 3px;
    }
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
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop());
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

        const { fps, jpegQuality } = values;
        const intervalMs = Math.round(1000 / fps);

        setIsStreaming(true);

        intervalRef.current = setInterval(async () => {
            const video = videoRef.current;
            if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;

            // Draw current video frame onto offscreen canvas
            const w = video.videoWidth;
            const h = video.videoHeight;
            if (w === 0 || h === 0) return;

            offscreenCanvas.width = w;
            offscreenCanvas.height = h;
            const ctx = offscreenCanvas.getContext("2d");
            if (!ctx) return;
            ctx.drawImage(video, 0, 0, w, h);

            // Encode as JPEG blob and publish as binary NATS message
            offscreenCanvas.toBlob(
                async (blob) => {
                    if (!blob || !natsClient) return;
                    const arrayBuffer = await blob.arrayBuffer();
                    const imageBytes = new Uint8Array(arrayBuffer);

                    const h = headers();
                    h.set("Content-Type", "image/jpeg");

                    natsClient.publish(natsSubject, imageBytes, { headers: h });
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
                <Formik initialValues={initialValues} validationSchema={validationSchema} onSubmit={handleSubmit}>
                    {(formik) => (
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
