// Sensor "Mobile audio" de la página "Mobile sensors": graba un audio con el micrófono del móvil y lo envía,
// como bytes, por el tópico "Mobile audio topic" del activo (tipo dev2dtm, como la foto y el vídeo):
// dev2dtm.Group_<groupUid>.Topic_<topicUid>, con la cabecera Content-Type del formato grabado
// (audio/webm en Chrome/Firefox, audio/mp4 en Safari). En un pipeline lo recibe un nodo Listen y, por
// ejemplo, un nodo Transcriptor lo pasa a texto.
import { FC, SyntheticEvent, useEffect, useRef, useState } from "react";
import { type NatsConnection, headers } from "@nats-io/nats-core";
import styled, { css, keyframes } from "styled-components";
import { IMobileTopic } from "../PlatformAssistant/TableColumns/topicsColumns";
import { canRecordAudio, Recording, startRecording } from "../../tools/audioRecorder";

const Title = styled.h2`
    font-size: 20px;
    margin-top: 30px;
    margin-bottom: 0px;
    font-weight: 400;
    text-align: center;
    color: white;
    width: 300px;
`;

const ConnectionLed = styled.span<{ isNatsConnected: boolean }>`
    background-color: ${(props) => (props.isNatsConnected ? "#62f700" : "#f80000")};
    width: 17px;
    height: 17px;
    margin: -2px 10px;
    border-radius: 50%;
    border: 2px solid #ffffff;
    display: inline-block;
`;

const FormContainer = styled.div`
    font-size: 14px;
    width: calc(100vw - 40px);
    max-width: 400px;
    margin: 10px 0;
    padding: 24px 16px 20px;
    color: white;
    border: 2px solid #3274d9;
    border-radius: 15px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 18px;
`;

const pulse = keyframes`
    0% { box-shadow: 0 0 0 0 rgba(224, 47, 68, 0.55); }
    70% { box-shadow: 0 0 0 22px rgba(224, 47, 68, 0); }
    100% { box-shadow: 0 0 0 0 rgba(224, 47, 68, 0); }
`;

const RecordButton = styled.button<{ $recording: boolean }>`
    width: 112px;
    height: 112px;
    border-radius: 50%;
    border: 4px solid ${({ $recording }) => ($recording ? "#e02f44" : "#3274d9")};
    background-color: ${({ $recording }) => ($recording ? "rgba(224, 47, 68, 0.15)" : "#141619")};
    color: white;
    font-size: 15px;
    cursor: pointer;
    ${({ $recording }) =>
        $recording &&
        css`
            animation: ${pulse} 1.4s ease-out infinite;
        `}

    &:disabled {
        cursor: not-allowed;
        opacity: 0.5;
    }

    &:focus-visible {
        outline: 2px solid #3d82f0;
        outline-offset: 4px;
    }
`;

const Level = styled.div`
    width: 100%;
    height: 6px;
    border-radius: 3px;
    background-color: #202226;
    overflow: hidden;

    div {
        height: 100%;
        background-color: #62f700;
        transition: width 0.1s linear;
    }
`;

const Status = styled.p`
    margin: 0;
    min-height: 1.4em;
    color: #c3c9d1;
    text-align: center;
`;

const Player = styled.audio`
    width: 100%;
`;

const Buttons = styled.div`
    width: 100%;
    display: flex;
    justify-content: space-between;
    gap: 12px;
`;

const Button = styled.button`
    flex: 1;
    background-color: #3274d9;
    padding: 8px 20px;
    color: white;
    border: 1px solid #2c3235;
    border-radius: 10px;
    cursor: pointer;
    box-shadow: 0 5px #173b70;
    font-size: 15px;

    &:active {
        box-shadow: 0 2px #173b70;
        transform: translateY(3px);
    }

    &:disabled {
        cursor: not-allowed;
        background-color: #3c3d40;
        box-shadow: 0 5px #19191a;
    }
`;

const MAX_SECONDS = 60;

interface MobileAudioFormProps {
    natsClient: NatsConnection;
    isNatsConnected: boolean;
    setMobileSensorSelected: React.Dispatch<React.SetStateAction<string>>;
    mobileTopicSelected: IMobileTopic;
}

const formatTime = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

const MobileAudioForm: FC<MobileAudioFormProps> = ({
    natsClient,
    isNatsConnected,
    setMobileSensorSelected,
    mobileTopicSelected,
}) => {
    const [recordingState, setRecordingState] = useState<"idle" | "recording" | "recorded" | "sending">("idle");
    const [audio, setAudio] = useState<Blob | null>(null);
    const [audioUrl, setAudioUrl] = useState<string | null>(null);
    const [level, setLevel] = useState(0);
    const [seconds, setSeconds] = useState(0);
    const [status, setStatus] = useState("");
    const recordingRef = useRef<Recording | null>(null);
    const supported = canRecordAudio();

    useEffect(() => {
        return () => recordingRef.current?.cancel();
    }, []);

    useEffect(() => {
        if (!audio) {
            setAudioUrl(null);
            return;
        }
        const url = URL.createObjectURL(audio);
        setAudioUrl(url);
        return () => URL.revokeObjectURL(url);
    }, [audio]);

    useEffect(() => {
        if (recordingState !== "recording") return;
        const startedAt = Date.now();
        const id = setInterval(() => setSeconds(Math.floor((Date.now() - startedAt) / 1000)), 250);
        return () => clearInterval(id);
    }, [recordingState]);

    const record = async () => {
        setStatus("");
        setAudio(null);
        setSeconds(0);
        let recording: Recording;
        try {
            recording = await startRecording({
                maxDurationMs: MAX_SECONDS * 1000,
                requireSpeech: false,
                onLevel: setLevel,
            });
        } catch (error) {
            console.error("Microphone access denied:", error);
            setStatus("The microphone is not available: allow access to it in the browser.");
            return;
        }
        recordingRef.current = recording;
        setRecordingState("recording");
        const recorded = await recording.finished;
        recordingRef.current = null;
        setLevel(0);
        if (recorded) {
            setAudio(recorded);
            setRecordingState("recorded");
            setStatus(`Recorded ${(recorded.size / 1024).toFixed(0)} KB. Listen to it and send it.`);
        } else {
            setRecordingState("idle");
        }
    };

    const stop = () => {
        void recordingRef.current?.stop();
    };

    const send = () => {
        if (!audio || !natsClient || !isNatsConnected) return;
        setRecordingState("sending");
        const natsSubject = `dev2dtm.Group_${mobileTopicSelected.groupUid}.Topic_${mobileTopicSelected.topicUid}`;
        audio
            .arrayBuffer()
            .then((buffer) => {
                const h = headers();
                // sin parámetros: "audio/webm;codecs=opus" -> "audio/webm"
                h.set("Content-Type", audio.type.split(";")[0] || "audio/webm");
                h.set("X-Capture-Ts", String(Date.now()));
                natsClient.publish(natsSubject, new Uint8Array(buffer), { headers: h });
                setStatus("Audio sent.");
                setAudio(null);
                setRecordingState("idle");
            })
            .catch((error) => {
                console.error(error);
                setStatus("The audio could not be sent.");
                setRecordingState("recorded");
            });
    };

    const onCancel = (e: SyntheticEvent) => {
        e.preventDefault();
        recordingRef.current?.cancel();
        setMobileSensorSelected("none");
    };

    const recording = recordingState === "recording";

    return (
        <>
            <Title>
                Mobile audio <ConnectionLed isNatsConnected={isNatsConnected} />
            </Title>
            <FormContainer>
                {!supported ? (
                    <Status>This browser cannot record audio.</Status>
                ) : (
                    <>
                        <RecordButton
                            type="button"
                            $recording={recording}
                            onClick={recording ? stop : record}
                            disabled={recordingState === "sending"}
                            aria-pressed={recording}
                        >
                            {recording ? `Stop ${formatTime(seconds)}` : audio ? "Record again" : "Record"}
                        </RecordButton>
                        <Level aria-hidden>
                            <div style={{ width: `${Math.round(level * 100)}%` }} />
                        </Level>
                        <Status role="status">
                            {recording ? `Recording… (up to ${MAX_SECONDS} s)` : status}
                        </Status>
                        {audioUrl && <Player src={audioUrl} controls />}
                    </>
                )}
                <Buttons>
                    <Button type="button" onClick={onCancel}>
                        Cancel
                    </Button>
                    <Button
                        type="button"
                        onClick={send}
                        disabled={!audio || !isNatsConnected || recordingState !== "recorded"}
                    >
                        Send
                    </Button>
                </Buttons>
            </FormContainer>
        </>
    );
};

export default MobileAudioForm;
