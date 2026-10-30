// Sensor "Mobile audio" de la página "Mobile sensors": graba un audio con el micrófono del móvil y lo envía,
// como bytes, por el tópico "Mobile audio topic" del activo (tipo dev2dtm, como la foto y el vídeo):
// dev2dtm.Group_<groupUid>.Topic_<topicUid>, con la cabecera Content-Type del formato grabado
// (audio/webm en Chrome/Firefox, audio/mp4 en Safari). En un pipeline lo recibe un nodo Listen y, por
// ejemplo, un nodo Transcriptor lo pasa a texto, lo envía al AI Agent y el chat del gemelo digital lo muestra
// (mobile_audio_to_chat_pipeline.yml).
//
// Como un mensaje de voz de WhatsApp o Telegram: se graba mientras se mantiene pulsado el botón y se envía al
// soltarlo. Si se desliza el dedo fuera del botón y se suelta, se cancela; una pulsación de menos de medio segundo
// no se envía. El audio enviado se puede volver a escuchar hasta que se graba otro. También con el teclado:
// mantener pulsada la barra espaciadora o Enter sobre el botón.
//
// El micrófono se abre la primera vez (el navegador pide permiso) y se mantiene abierto un rato entre
// grabaciones para que la siguiente empiece al instante; se cierra al minuto sin grabar y al salir.
import { FC, KeyboardEvent, PointerEvent, SyntheticEvent, useCallback, useEffect, useRef, useState } from "react";
import { type NatsConnection, headers } from "@nats-io/nats-core";
import styled, { css, keyframes } from "styled-components";
import { FaMicrophone, FaCheck } from "react-icons/fa";
import { IMobileTopic } from "../PlatformAssistant/TableColumns/topicsColumns";
import { canRecordAudio, openMicrophone, Recording, startRecording } from "../../tools/audioRecorder";
import { useLoggedUserLogin } from "../../contexts/authContext/authContext";
import { asIcon } from "../../tools/icons";

const FaMicrophoneIcon = asIcon(FaMicrophone);
const FaCheckIcon = asIcon(FaCheck);

const Title = styled.h2`
    font-size: 20px;
    margin-top: 30px;
    margin-bottom: 0px;
    font-weight: 400;
    text-align: center;
    color: white;
    width: 300px;
`;

const ConnectionLed = styled.span<{ $isNatsConnected: boolean }>`
    background-color: ${(props) => (props.$isNatsConnected ? "#62f700" : "#f80000")};
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
    gap: 16px;
`;

const pulse = keyframes`
    0% { box-shadow: 0 0 0 0 rgba(224, 47, 68, 0.55); }
    70% { box-shadow: 0 0 0 26px rgba(224, 47, 68, 0); }
    100% { box-shadow: 0 0 0 0 rgba(224, 47, 68, 0); }
`;

type Phase = "idle" | "opening" | "recording" | "sending";

const RecordButton = styled.button<{ $recording: boolean; $willCancel: boolean }>`
    width: 120px;
    height: 120px;
    border-radius: 50%;
    border: 4px solid ${({ $recording, $willCancel }) => ($willCancel ? "#9aa0a6" : $recording ? "#e02f44" : "#3274d9")};
    background-color: ${({ $recording, $willCancel }) =>
        $willCancel ? "#2c3235" : $recording ? "#e02f44" : "#141619"};
    color: white;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    font-size: 15px;
    font-variant-numeric: tabular-nums;
    transition:
        transform 0.15s ease,
        background-color 0.15s ease;
    transform: scale(${({ $recording }) => ($recording ? 1.12 : 1)});
    /* mantener pulsado: sin menú contextual, selección de texto ni desplazamiento de la página */
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
    -webkit-touch-callout: none;
    -webkit-tap-highlight-color: transparent;
    ${({ $recording, $willCancel }) =>
        $recording &&
        !$willCancel &&
        css`
            animation: ${pulse} 1.4s ease-out infinite;
        `}

    svg {
        width: 38px;
        height: 38px;
    }

    &:disabled {
        cursor: not-allowed;
        opacity: 0.5;
    }

    &:focus-visible {
        outline: 2px solid #3d82f0;
        outline-offset: 6px;
    }
`;

const Level = styled.div<{ $visible: boolean }>`
    width: 100%;
    height: 6px;
    border-radius: 3px;
    background-color: #202226;
    overflow: hidden;
    visibility: ${({ $visible }) => ($visible ? "visible" : "hidden")};

    div {
        height: 100%;
        background-color: #62f700;
        transition: width 0.1s linear;
    }
`;

const Hint = styled.p<{ $warning?: boolean }>`
    margin: 0;
    min-height: 2.8em;
    color: ${({ $warning }) => ($warning ? "#ff8a76" : "#c3c9d1")};
    text-align: center;
`;

const Sent = styled.div`
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 6px;

    span {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 13px;
        color: #9aa0a6;
    }

    svg {
        color: #62f700;
    }
`;

const Player = styled.audio`
    width: 100%;
`;

const Button = styled.button`
    width: 100%;
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
// pulsaciones más cortas no se envían (un toque sin querer)
const MIN_RECORDING_MS = 500;
// distancia (px) del dedo al botón a partir de la cual soltar cancela
const CANCEL_DISTANCE = 70;
// el micrófono se cierra tras este tiempo sin grabar
const RELEASE_MICROPHONE_MS = 60_000;

interface MobileAudioFormProps {
    natsClient: NatsConnection;
    isNatsConnected: boolean;
    setMobileSensorSelected: React.Dispatch<React.SetStateAction<string>>;
    mobileTopicSelected: IMobileTopic;
}

const formatTime = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

interface Press {
    // el botón sigue pulsado
    held: boolean;
    // soltar ahora cancela (el dedo se ha alejado del botón)
    willCancel: boolean;
}

const MobileAudioForm: FC<MobileAudioFormProps> = ({
    natsClient,
    isNatsConnected,
    setMobileSensorSelected,
    mobileTopicSelected,
}) => {
    const [phase, setPhase] = useState<Phase>("idle");
    const [willCancel, setWillCancel] = useState(false);
    const [sent, setSent] = useState<{ blob: Blob; seconds: number } | null>(null);
    const [sentUrl, setSentUrl] = useState<string | null>(null);
    const [level, setLevel] = useState(0);
    const [seconds, setSeconds] = useState(0);
    const [message, setMessage] = useState<{ text: string; warning?: boolean } | null>(null);
    const recordingRef = useRef<Recording | null>(null);
    const pressRef = useRef<Press>({ held: false, willCancel: false });
    const streamRef = useRef<MediaStream | null>(null);
    const releaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const userName = useLoggedUserLogin();
    const supported = canRecordAudio();

    const closeMicrophone = useCallback(() => {
        if (releaseTimerRef.current) clearTimeout(releaseTimerRef.current);
        releaseTimerRef.current = null;
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
    }, []);

    useEffect(() => {
        return () => {
            recordingRef.current?.cancel();
            closeMicrophone();
        };
    }, [closeMicrophone]);

    useEffect(() => {
        if (!sent) {
            setSentUrl(null);
            return;
        }
        const url = URL.createObjectURL(sent.blob);
        setSentUrl(url);
        return () => URL.revokeObjectURL(url);
    }, [sent]);

    useEffect(() => {
        if (phase !== "recording") return;
        const startedAt = Date.now();
        setSeconds(0);
        const id = setInterval(() => setSeconds(Math.floor((Date.now() - startedAt) / 1000)), 200);
        return () => clearInterval(id);
    }, [phase]);

    const microphone = async (): Promise<MediaStream> => {
        if (releaseTimerRef.current) clearTimeout(releaseTimerRef.current);
        releaseTimerRef.current = null;
        const current = streamRef.current;
        if (current && current.getAudioTracks().some((track) => track.readyState === "live")) return current;
        const stream = await openMicrophone();
        streamRef.current = stream;
        return stream;
    };

    const closeMicrophoneLater = () => {
        if (releaseTimerRef.current) clearTimeout(releaseTimerRef.current);
        releaseTimerRef.current = setTimeout(closeMicrophone, RELEASE_MICROPHONE_MS);
    };

    const send = (blob: Blob, durationSeconds: number) => {
        if (!natsClient || !isNatsConnected) {
            setMessage({ text: "Not connected: the audio could not be sent.", warning: true });
            setPhase("idle");
            return;
        }
        setPhase("sending");
        const natsSubject = `dev2dtm.Group_${mobileTopicSelected.groupUid}.Topic_${mobileTopicSelected.topicUid}`;
        blob.arrayBuffer()
            .then((buffer) => {
                const h = headers();
                // sin parámetros: "audio/webm;codecs=opus" -> "audio/webm"
                h.set("Content-Type", blob.type.split(";")[0] || "audio/webm");
                h.set("X-Capture-Ts", String(Date.now()));
                // quién lo grabó (el nodo Listen lo pasa al payload como "userName"): el chat del gemelo digital
                // muestra la transcripción solo a este usuario
                if (userName) h.set("Payload-UserName", userName);
                natsClient.publish(natsSubject, new Uint8Array(buffer), { headers: h });
                setSent({ blob, seconds: durationSeconds });
                setMessage(null);
            })
            .catch((error) => {
                console.error(error);
                setMessage({ text: "The audio could not be sent.", warning: true });
            })
            .finally(() => setPhase("idle"));
    };

    const record = async () => {
        // se empieza de nuevo: el audio anterior deja de mostrarse
        setSent(null);
        setMessage(null);
        setWillCancel(false);
        setPhase("opening");
        let stream: MediaStream;
        try {
            stream = await microphone();
        } catch (error) {
            console.error("Microphone access denied:", error);
            setMessage({ text: "The microphone is not available: allow access to it in the browser.", warning: true });
            setPhase("idle");
            return;
        }
        if (!pressRef.current.held) {
            // se soltó mientras se abría el micrófono (por ejemplo, mientras el navegador pedía permiso)
            setMessage({ text: "Microphone ready. Hold the button down while you speak." });
            setPhase("idle");
            closeMicrophoneLater();
            return;
        }
        let recording: Recording;
        try {
            recording = await startRecording({
                stream,
                maxDurationMs: MAX_SECONDS * 1000,
                requireSpeech: false,
                onLevel: setLevel,
            });
        } catch (error) {
            console.error("The recording could not start:", error);
            setMessage({ text: "The recording could not start.", warning: true });
            setPhase("idle");
            return;
        }
        const startedAt = Date.now();
        recordingRef.current = recording;
        setPhase("recording");
        // soltado justo mientras empezaba
        if (!pressRef.current.held) {
            if (pressRef.current.willCancel) recording.cancel();
            else void recording.stop();
        }

        const blob = await recording.finished;
        const durationMs = Date.now() - startedAt;
        recordingRef.current = null;
        setLevel(0);
        setWillCancel(false);
        closeMicrophoneLater();
        if (!blob) {
            setMessage({ text: "Recording cancelled." });
            setPhase("idle");
        } else if (durationMs < MIN_RECORDING_MS) {
            setMessage({ text: "Too short. Hold the button down while you speak and release it to send." });
            setPhase("idle");
        } else {
            send(blob, Math.max(1, Math.round(durationMs / 1000)));
        }
    };

    const press = () => {
        if (phase === "opening" || phase === "recording" || phase === "sending") return;
        pressRef.current = { held: true, willCancel: false };
        void record();
    };

    const release = (cancel: boolean) => {
        if (!pressRef.current.held) return;
        pressRef.current = { held: false, willCancel: cancel };
        const recording = recordingRef.current;
        if (!recording) return; // aún abriendo el micrófono: record() lo ve al terminar
        if (cancel) recording.cancel();
        else void recording.stop();
    };

    const onPointerDown = (e: PointerEvent<HTMLButtonElement>) => {
        if (e.button !== 0) return;
        e.preventDefault();
        // los eventos siguen llegando aunque el dedo salga del botón
        e.currentTarget.setPointerCapture(e.pointerId);
        press();
    };

    const onPointerMove = (e: PointerEvent<HTMLButtonElement>) => {
        if (!pressRef.current.held) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const dx = Math.max(rect.left - e.clientX, 0, e.clientX - rect.right);
        const dy = Math.max(rect.top - e.clientY, 0, e.clientY - rect.bottom);
        const away = Math.hypot(dx, dy) > CANCEL_DISTANCE;
        if (away !== pressRef.current.willCancel) {
            pressRef.current.willCancel = away;
            setWillCancel(away);
        }
    };

    const onPointerUp = () => release(pressRef.current.willCancel);
    const onPointerCancel = () => release(true);

    const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
        if ((e.key === " " || e.key === "Enter") && !e.repeat) {
            e.preventDefault();
            press();
        } else if (e.key === "Escape") {
            release(true);
        }
    };

    const onKeyUp = (e: KeyboardEvent<HTMLButtonElement>) => {
        if (e.key === " " || e.key === "Enter") {
            e.preventDefault();
            release(false);
        }
    };

    const onClose = (e: SyntheticEvent) => {
        e.preventDefault();
        recordingRef.current?.cancel();
        closeMicrophone();
        setMobileSensorSelected("none");
    };

    const recording = phase === "recording";
    let hint: { text: string; warning?: boolean };
    if (recording) {
        hint = willCancel
            ? { text: "Release to cancel", warning: true }
            : { text: `Release to send · slide away to cancel (up to ${MAX_SECONDS} s)` };
    } else if (phase === "opening") {
        hint = { text: "Opening the microphone…" };
    } else if (phase === "sending") {
        hint = { text: "Sending…" };
    } else if (message) {
        hint = message;
    } else if (!isNatsConnected) {
        hint = { text: "Not connected: wait until the light turns green.", warning: true };
    } else {
        hint = { text: "Hold the button down to record. Release it to send." };
    }

    return (
        <>
            <Title>
                Mobile audio <ConnectionLed $isNatsConnected={isNatsConnected} />
            </Title>
            <FormContainer>
                {!supported ? (
                    <Hint $warning>This browser cannot record audio.</Hint>
                ) : (
                    <>
                        <RecordButton
                            type="button"
                            $recording={recording}
                            $willCancel={recording && willCancel}
                            disabled={phase === "sending"}
                            aria-label={recording ? "Recording: release to send" : "Hold to record"}
                            aria-pressed={recording}
                            onPointerDown={onPointerDown}
                            onPointerMove={onPointerMove}
                            onPointerUp={onPointerUp}
                            onPointerCancel={onPointerCancel}
                            onKeyDown={onKeyDown}
                            onKeyUp={onKeyUp}
                            onBlur={() => release(true)}
                            onContextMenu={(e) => e.preventDefault()}
                        >
                            <FaMicrophoneIcon />
                            {recording && <span>{formatTime(seconds)}</span>}
                        </RecordButton>
                        <Level $visible={recording} aria-hidden>
                            <div style={{ width: `${Math.round(level * 100)}%` }} />
                        </Level>
                        <Hint role="status" $warning={hint.warning}>
                            {hint.text}
                        </Hint>
                        {sent && sentUrl && !recording && (
                            <Sent>
                                <span>
                                    <FaCheckIcon /> Sent · {formatTime(sent.seconds)}
                                </span>
                                <Player src={sentUrl} controls />
                            </Sent>
                        )}
                    </>
                )}
                <Button type="button" onClick={onClose}>
                    Close
                </Button>
            </FormContainer>
        </>
    );
};

export default MobileAudioForm;