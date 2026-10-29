import React, { useState, KeyboardEvent, ChangeEvent, useRef, useEffect, useCallback } from "react";
import styled from "styled-components";
import SpeechRecognition, { useSpeechRecognition } from "react-speech-recognition";
import { FaMicrophone, FaMicrophoneSlash, FaWrench, FaTrashAlt, FaSlidersH, FaTimes } from "react-icons/fa";
import { useSpeechSynthesis } from "./useSpeechSynthesis";
import { useLoggedUserLogin } from "../../../../contexts/authContext/authContext";
import { normalizeForTTS } from "./ttsNormalizer";
import { containsLatex, MathMessage } from "./MathMessage";
import { asIcon } from "../../../../tools/icons";
import { canRecordAudio, Recording, startRecording } from "../../../../tools/audioRecorder";
import { hasSpeechSynthesisVoices, PipelineVoiceService, playAudioBlob } from "./voiceService";
import {
    COUNTDOWN_GRACE_MS,
    MAX_PAUSE_MS,
    MIN_PAUSE_MS,
    turnPauseMs,
    useVoiceTurnSettings,
} from "./voiceTurn";

const FaMicrophoneIcon = asIcon(FaMicrophone);
const FaMicrophoneSlashIcon = asIcon(FaMicrophoneSlash);
const FaWrenchIcon = asIcon(FaWrench);
const FaTrashAltIcon = asIcon(FaTrashAlt);
const FaSlidersHIcon = asIcon(FaSlidersH);
const FaTimesIcon = asIcon(FaTimes);

const getVoices = (lang: string) => {
    const isSpanish = lang.includes("es");
    return Promise.resolve({
        greeting: isSpanish ? "¡Hola! Soy OSI. ¿En qué puedo ayudarte?" : "Hello! I'm OSI. How can I help you?",
        recognitionLang: isSpanish ? "es-ES" : "en-US",
        speechLang: isSpanish ? "es-ES" : "en-US",
    });
};

export interface McpToolCall {
    tool_name: string;
    args: string[];
}

export interface LlmMessage {
    message: string;
    uiOpts: Record<string, any>;
    mcpToolCalls: McpToolCall[];
    sender: "user" | "assistant" | "system";
    // pregunta de voz transcrita en el pipeline: quién la hizo
    userName?: string;
}

export interface ChatMessage {
    message: string;
    userName: string;
    sender: "user" | "assistant" | "system";
    time: string;
    mcpToolCalls: McpToolCall[];
    // "pipeline": pregunta de voz (sensor "Mobile audio", nota de voz de Telegram) transcrita en el pipeline, que
    // ya la ha enviado al AI Agent: el visor solo la muestra
    source?: "pipeline";
}

export interface IChatVoice {
    greeting: string;
    recognitionLang: string;
    speechLang: string;
}

// Debajo de la barra superior del visor, dentro del área del visor
const ChatContainer = styled.div`
    position: absolute;
    top: 76px;
    right: 12px;
    bottom: 12px;
    width: 600px;
    min-width: min(600px, calc(100% - 24px));
    max-width: calc(100% - 24px);
    z-index: 999;
    background-color: #2c2c2c;
    border: 1px solid #444;
    border-radius: 8px;
    overflow: hidden;
    font-family: Arial, sans-serif;
    display: flex;
    flex-direction: column;
    resize: horizontal;
    resize-origin: left;

    &::before {
        content: "";
        position: absolute;
        left: 0;
        top: 0;
        bottom: 0;
        width: 4px;
        background: transparent;
        cursor: ew-resize;
        z-index: 10;
    }

    &::before:hover {
        background: rgba(50, 116, 217, 0.3);
    }
`;

const ResizeHandle = styled.div`
    position: absolute;
    left: -2px;
    top: 0;
    bottom: 0;
    width: 4px;
    background: transparent;
    cursor: ew-resize;
    z-index: 10;

    &:hover {
        background: rgba(50, 116, 217, 0.5);
    }

    &:active {
        background: rgba(50, 116, 217, 0.8);
    }
`;

const MessagesContainer = styled.div`
    flex: 1;
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 10px;
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
`;

interface MessageBubbleProps {
    sender: "user" | "assistant" | "system";
}

const MessageBubble = styled.div<MessageBubbleProps>`
    padding: 8px 12px;
    border-radius: 20px;
    max-width: 90%;
    word-wrap: break-word;
    align-self: ${({ sender }) => (sender === "user" ? "flex-end" : "flex-start")};
    background-color: ${({ sender }) =>
        sender === "user" ? "#3a3a3a" : sender === "assistant" ? "#555" : "#a54646ff"};
    color: #f1f1f1;
    position: relative;
    font-size: 0.9rem;
`;

const McpToolsList = styled.div`
    margin-top: 8px;
    padding-top: 6px;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    font-size: 0.7rem;
    color: #bbb;
    line-height: 1.2;
`;

const McpToolItem = styled.div`
    margin-bottom: 3px;
    font-family: "Courier New", monospace;

    &:last-child {
        margin-bottom: 0;
    }
`;

const ToolName = styled.span`
    color: #4a9eff;
    font-weight: bold;
`;

const ToolArgs = styled.span`
    color: #999;
    margin-left: 4px;
`;

const Label = styled.span`
    font-size: 0.75rem;
    font-weight: bold;
    margin-bottom: 4px;
    display: block;
    color: #bbb;
`;

// Contenedor para el spinner dentro del mensaje
const MessageSpinnerContainer = styled.div`
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 4px 0;
`;

const ThinkingText = styled.span`
    color: #bbb;
    font-style: italic;
`;

const MiniSpinner = styled.div`
    width: 16px;
    height: 16px;
    border: 2px solid rgba(50, 116, 217, 0.2);
    border-top: 2px solid #3274d9;
    border-radius: 50%;
    animation: spin 1s linear infinite;

    @keyframes spin {
        0% {
            transform: rotate(0deg);
        }
        100% {
            transform: rotate(360deg);
        }
    }
`;

// El cuadro de texto ocupa toda la altura de la columna de botones: sus bordes quedan alineados
const InputContainer = styled.div`
    display: flex;
    border-top: 1px solid #444;
    padding: 8px;
    background-color: #1f1f1f;
    font-size: 0.9rem;
    gap: 10px;
    align-items: stretch;
`;

const TextArea = styled.textarea`
    flex: 1;
    align-self: stretch;
    min-width: 0;
    min-height: 80px;
    margin: 0;
    padding: 8px;
    border: 1px solid #444;
    border-radius: 4px;
    background-color: #2c2c2c;
    color: #f1f1f1;
    resize: none;
    font-family: inherit;
    font-size: inherit;
    line-height: 1.4;
`;

// Columna de botones: "Send", los iconos y el estado ocupan el mismo ancho
const ButtonContainer = styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 168px;
    flex-shrink: 0;
`;

const ButtonRow = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    height: 30px;
`;

const Button = styled.button`
    padding: 0 12px;
    margin: 0;
    color: #fff;
    cursor: pointer;
    border: none;
    border-radius: 4px;
    background-color: #3274d9;
    font-size: 0.95rem;
    height: 30px;
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;

    &:hover {
        background: #2461c0;
    }

    &:disabled {
        background-color: #666;
        cursor: not-allowed;
        opacity: 0.6;
    }
`;

const ToggleButton = styled.button<{ active: boolean }>`
    padding: 4px;
    border: none;
    border-radius: 50%;
    background-color: ${({ active }) => (active ? "#3274d9" : "#666")};
    color: #fff;
    cursor: pointer;
    font-size: 0.8rem;
    width: 30px;
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;

    &:hover {
        background-color: ${({ active }) => (active ? "#2461c0" : "#555")};
    }
`;

const TrashButton = styled.button<{ active: boolean }>`
    padding: 4px;
    border: none;
    border-radius: 50%;
    background-color: ${({ active }) => (active ? "#3274d9" : "#666")};
    color: #fff;
    cursor: pointer;
    font-size: 0.8rem;
    width: 30px;
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;

    &:hover {
        background-color: ${({ active }) => (active ? "#2461c0" : "#555")};
    }
`;

const MicButton = styled.button<{ active: boolean }>`
    padding: 4px;
    border: none;
    border-radius: 50%;
    background-color: ${({ active }) => (active ? "#c0392b" : "#3274d9")};
    color: #fff;
    cursor: pointer;
    font-size: 0.9rem;
    width: 30px;
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;

    &:hover {
        background-color: ${({ active }) => (active ? "#8f2b21" : "#2461c0")};
    }

    &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
`;

// Cuenta atrás antes de enviar una pregunta hablada: anillo alrededor del micrófono
const COUNTDOWN_RADIUS = 17;
const COUNTDOWN_LENGTH = 2 * Math.PI * COUNTDOWN_RADIUS;

const MicWrap = styled.div`
    position: relative;
    width: 30px;
    height: 30px;
    flex-shrink: 0;

    svg.countdown {
        position: absolute;
        top: -4px;
        left: -4px;
        width: 38px;
        height: 38px;
        pointer-events: none;
        transform: rotate(-90deg);
    }

    circle {
        fill: none;
        stroke: #f39c12;
        stroke-width: 3;
        stroke-linecap: round;
        transition: stroke-dashoffset 0.1s linear;
    }
`;

const SmallButton = styled.button<{ active?: boolean }>`
    padding: 4px;
    border: none;
    border-radius: 50%;
    background-color: ${({ active }) => (active ? "#3274d9" : "#666")};
    color: #fff;
    cursor: pointer;
    font-size: 0.7rem;
    width: 24px;
    height: 24px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;

    &:hover {
        background-color: ${({ active }) => (active ? "#2461c0" : "#555")};
    }

    &:focus-visible {
        outline: 2px solid #3d82f0;
        outline-offset: 2px;
    }
`;

const VoiceSettingsPanel = styled.div`
    border-top: 1px solid #444;
    background-color: #1f1f1f;
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    font-size: 0.8rem;
    color: #ddd;

    strong {
        font-size: 0.75rem;
        color: #bbb;
    }

    label {
        display: flex;
        align-items: center;
        gap: 8px;
        cursor: pointer;
    }

    label[aria-disabled="true"] {
        opacity: 0.5;
        cursor: default;
    }

    input[type="range"] {
        flex: 1;
        min-width: 80px;
        accent-color: #3274d9;
    }

    input[type="checkbox"] {
        accent-color: #3274d9;
        flex-shrink: 0;
    }

    output {
        min-width: 3.2em;
        text-align: right;
        font-variant-numeric: tabular-nums;
    }
`;

const StatusIndicator = styled.div<{ status: string }>`
    padding: 4px 6px;
    border-radius: 4px;
    background-color: ${({ status }) => {
        switch (status) {
            case "listening":
                return "#27ae60";
            case "processing":
                return "#f39c12";
            case "speaking":
                return "#e74c3c";
            default:
                return "#95a5a6";
        }
    }};
    color: white;
    height: 24px;
    flex: 0 0 80%;
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 0.68rem;
`;

interface ChatAssistantProps {
    chatMessages: ChatMessage[];
    setChatMessages: (messages: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
    chatAssistantLanguage: string;
    handleRemoveChatAssistantHistory: () => void;
    // voz a texto y texto a voz con el pipeline del gemelo digital, cuando el navegador no los ofrece
    voiceService?: PipelineVoiceService | null;
}

// texto en directo con el pipeline: cada cuánto se transcribe lo grabado mientras se habla, silencio a partir del
// cual se considera que empieza una pausa, y tiempo extra que se espera a la transcripción parcial en la pausa
const PARTIAL_INTERVAL_MS = 1500;
const PARTIAL_PAUSE_MS = 300;
const PARTIAL_WAIT_MS = 1000;

// errores del reconocimiento de voz del navegador por los que se pasa a usar el pipeline
const NATIVE_STT_UNAVAILABLE_ERRORS = ["network", "service-not-allowed", "language-not-supported"];

const ChatAssistant: React.FC<ChatAssistantProps> = ({
    chatMessages,
    setChatMessages,
    chatAssistantLanguage,
    handleRemoveChatAssistantHistory,
    voiceService = null,
}) => {
    const isMounted = useRef(true);
    const userName = useLoggedUserLogin();
    const [input, setInput] = useState<string>("");
    const [showMcpTools, setShowMcpTools] = useState<boolean>(false);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const { transcript, resetTranscript, browserSupportsSpeechRecognition } = useSpeechRecognition();
    const [isVoiceEnabled, setIsVoiceEnabled] = useState<boolean>(false);
    const [systemStatus, setSystemStatus] = useState<"idle" | "listening" | "processing" | "speaking">("idle");
    const lastTranscriptRef = useRef<string>("");
    // cuándo cambió por última vez el texto dictado (para la pausa antes de enviar)
    const lastChangeAtRef = useRef<number>(0);
    const speakRef = useRef<((params: { text: string; voice: string }) => void) | undefined>(undefined);
    const initializedRef = useRef<boolean>(false);
    const [lastChatMessageIndex, setLastChatMessageIndex] = useState<number>(0);
    const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
    // Estados para el redimensionado
    const [isResizing, setIsResizing] = useState(false);
    const [containerWidth, setContainerWidth] = useState(520);
    const containerRef = useRef<HTMLDivElement>(null);
    const [voice, setVoice] = useState<IChatVoice | null>(null);
    const textAreaRef = useRef<HTMLTextAreaElement | null>(null);

    // Voz a texto: la del navegador si la tiene y funciona; si no, grabación + transcripción en el pipeline
    const [nativeSttFailed, setNativeSttFailed] = useState(false);
    const nativeStt = browserSupportsSpeechRecognition && !nativeSttFailed;
    const pipelineStt = !nativeStt && !!voiceService && canRecordAudio();
    const voiceInputAvailable = nativeStt || pipelineStt;
    const recordingRef = useRef<Recording | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const voiceEnabledRef = useRef(false);
    useEffect(() => {
        voiceEnabledRef.current = isVoiceEnabled;
    }, [isVoiceEnabled]);

    // Fin de la pregunta hablada (voiceTurn.ts): pausa configurable y adaptativa, cuenta atrás visible (0..1) que
    // se cancela al volver a hablar, y modo "pulsar para hablar"
    const [voiceSettings, updateVoiceSettings] = useVoiceTurnSettings();
    const voiceSettingsRef = useRef(voiceSettings);
    voiceSettingsRef.current = voiceSettings;
    const [showVoiceSettings, setShowVoiceSettings] = useState(false);
    const [countdown, setCountdown] = useState<number | null>(null);
    // grabación para el pipeline: ya se ha oído voz / se ha pedido descartarla
    const [pipelineHeardSpeech, setPipelineHeardSpeech] = useState(false);
    const pipelineHeardSpeechRef = useRef(false);
    const discardRecordingRef = useRef(false);
    // grabación en curso para el pipeline (las transcripciones parciales de una anterior se descartan)
    const pipelineSessionRef = useRef(0);

    // La voz (idioma) se carga siempre, también cuando el chat ya tiene historial: antes solo se cargaba
    // con el chat vacío y, con historial, el micrófono avisaba "voice not loaded" y no hacía nada.
    useEffect(() => {
        let alive = true;
        getVoices(chatAssistantLanguage).then((loaded) => alive && setVoice(loaded));
        return () => {
            alive = false;
        };
    }, [chatAssistantLanguage]);

    const addSystemMessage = useCallback(
        (message: string) => {
            setChatMessages((prev: ChatMessage[]) => [
                ...prev,
                { message, userName: "Assistant", sender: "system", time: new Date().toISOString(), mcpToolCalls: [] },
            ]);
        },
        [setChatMessages],
    );

    const normalizeTextForSpeech = useCallback(
        (text: string): string => {
            try {
                const normalizedText = normalizeForTTS(text, chatAssistantLanguage, "physics");
                return normalizedText;
            } catch (error) {
                console.error("Error normalizando texto para TTS:", error);
                return text;
            }
        },
        [chatAssistantLanguage],
    );

    const handleMouseDown = useCallback(
        (e: React.MouseEvent) => {
            e.preventDefault();
            setIsResizing(true);

            const startX = e.clientX;
            const startWidth = containerWidth;

            const handleMouseMove = (e: MouseEvent) => {
                const deltaX = startX - e.clientX;
                const newWidth = Math.max(520, Math.min(window.innerWidth - 80, startWidth + deltaX));
                setContainerWidth(newWidth);
            };

            const handleMouseUp = () => {
                setIsResizing(false);
                document.removeEventListener("mousemove", handleMouseMove);
                document.removeEventListener("mouseup", handleMouseUp);
                document.body.style.cursor = "";
                document.body.style.userSelect = "";
            };

            document.body.style.cursor = "ew-resize";
            document.body.style.userSelect = "none";
            document.addEventListener("mousemove", handleMouseMove);
            document.addEventListener("mouseup", handleMouseUp);
        },
        [containerWidth],
    );

    // envía un texto como pregunta del usuario (escrito o dictado)
    const sendText = useCallback(
        (text: string) => {
            const messageToSend = text.trim();
            if (messageToSend === "") return;

            setIsLoading(true);

            const newMessage: ChatMessage = {
                userName: userName,
                message: messageToSend,
                sender: "user",
                time: new Date().toISOString(),
                mcpToolCalls: [],
            };

            setChatMessages((prev: ChatMessage[]) => [...prev, newMessage]);
            setInput("");
            setCountdown(null);
            resetTranscript();
            lastTranscriptRef.current = "";
        },
        [resetTranscript, userName, setChatMessages],
    );

    // Pregunta por voz con el pipeline: graba hasta un silencio, la transcribe y la envía como texto
    const listenWithPipeline = useCallback(async () => {
        if (!voiceService || !voice) return;
        recordingRef.current?.cancel();
        voiceEnabledRef.current = true;
        setIsVoiceEnabled(true);
        setSystemStatus("listening");

        // Texto en directo: mientras se habla, el audio grabado hasta el momento se transcribe en el pipeline
        // cada PARTIAL_INTERVAL_MS (y al empezar cada pausa) y se muestra en el cuadro de texto. Esa
        // transcripción parcial también sirve para alargar la pausa si la frase parece a medias y, si ya cubre
        // todo lo dicho, como transcripción final (sin otra petición).
        // Con "pulsar para hablar" la grabación solo termina al tocar el micrófono.
        const settings = voiceSettingsRef.current;
        const lang = voice.recognitionLang;
        const session = ++pipelineSessionRef.current;
        const partial = { text: "", audioAt: 0, requestedAt: 0, pending: false };
        let lastVoiceAt = 0;
        let stopRequested = false;
        pipelineHeardSpeechRef.current = false;
        setPipelineHeardSpeech(false);
        setCountdown(null);
        setInput("");

        const requestPartial = (now: number) => {
            const snapshot = recordingRef.current?.snapshot();
            if (!snapshot || partial.pending || stopRequested) return;
            partial.pending = true;
            partial.requestedAt = now;
            voiceService
                .transcribe(snapshot, lang)
                .then((text) => {
                    if (pipelineSessionRef.current !== session) return;
                    partial.text = text;
                    partial.audioAt = now;
                    if (text) setInput(text);
                })
                .catch((error) => console.warn("Partial transcription failed:", error))
                .finally(() => {
                    partial.pending = false;
                });
        };

        let recording: Recording;
        try {
            recording = await startRecording({
                stopAfterSilenceMs: 0,
                noSpeechTimeoutMs: settings.pushToTalk ? 0 : 15000,
                maxDurationMs: settings.pushToTalk ? 120000 : 60000,
                onSilence: (silentMs) => {
                    const now = Date.now();
                    lastVoiceAt = now - silentMs;
                    if (!pipelineHeardSpeechRef.current) {
                        pipelineHeardSpeechRef.current = true;
                        setPipelineHeardSpeech(true);
                    }
                    // transcripción parcial: periódica mientras se habla y una al empezar la pausa
                    const speaking = silentMs < PARTIAL_PAUSE_MS;
                    if (speaking ? now - partial.requestedAt >= PARTIAL_INTERVAL_MS : partial.requestedAt < lastVoiceAt) {
                        requestPartial(now);
                    }
                    if (settings.pushToTalk || silentMs < COUNTDOWN_GRACE_MS) {
                        setCountdown(null);
                        return;
                    }
                    // pausa: adaptativa cuando la transcripción parcial ya cubre lo dicho; mientras llega, algo más
                    // larga que la configurada para darle tiempo
                    const covered = partial.audioAt >= lastVoiceAt;
                    const pause = covered
                        ? turnPauseMs(partial.text, lang, settings)
                        : settings.pauseMs + PARTIAL_WAIT_MS;
                    if (silentMs >= pause) {
                        if (!stopRequested) {
                            stopRequested = true;
                            setCountdown(null);
                            void recordingRef.current?.stop();
                        }
                        return;
                    }
                    setCountdown(Math.min(1, (silentMs - COUNTDOWN_GRACE_MS) / Math.max(1, pause - COUNTDOWN_GRACE_MS)));
                },
            });
        } catch (error) {
            console.error("Microphone not available:", error);
            voiceEnabledRef.current = false;
            setIsVoiceEnabled(false);
            setSystemStatus("idle");
            addSystemMessage("The microphone is not available: allow access to it in the browser to talk to the assistant.");
            return;
        }
        recordingRef.current = recording;
        const audio = await recording.finished;
        if (recordingRef.current === recording) recordingRef.current = null;
        setCountdown(null);
        pipelineHeardSpeechRef.current = false;
        setPipelineHeardSpeech(false);
        if (!voiceEnabledRef.current) return;

        // lo dicho se ha descartado con la ✕: se sigue escuchando
        if (discardRecordingRef.current) {
            discardRecordingRef.current = false;
            setInput("");
            void listenWithPipeline();
            return;
        }

        if (!audio) {
            // nadie habló: se apaga el micrófono
            voiceEnabledRef.current = false;
            setIsVoiceEnabled(false);
            setSystemStatus("idle");
            return;
        }

        // la transcripción parcial ya cubre todo lo dicho: se envía sin esperar a otra
        if (partial.text && !partial.pending && partial.audioAt >= lastVoiceAt) {
            pipelineSessionRef.current++;
            setSystemStatus("processing");
            setInput(partial.text);
            sendText(partial.text);
            return;
        }
        pipelineSessionRef.current++;

        setSystemStatus("processing");
        setIsLoading(true);
        try {
            const text = await voiceService.transcribe(audio, voice.recognitionLang);
            if (!voiceEnabledRef.current) {
                setIsLoading(false);
                return;
            }
            if (!text) {
                setIsLoading(false);
                if (settings.pushToTalk) setSystemStatus("idle");
                else void listenWithPipeline();
                return;
            }
            setInput(text);
            sendText(text);
        } catch (error) {
            console.error(error);
            setIsLoading(false);
            voiceEnabledRef.current = false;
            setIsVoiceEnabled(false);
            setSystemStatus("idle");
            addSystemMessage(error instanceof Error ? error.message : String(error));
        }
    }, [voiceService, voice, sendText, addSystemMessage]);

    const startListening = useCallback(() => {
        if (!voice) {
            console.warn("Speech recognition: the chat language is not loaded yet");
            return;
        }
        if (!nativeStt) {
            if (pipelineStt) void listenWithPipeline();
            else addSystemMessage("Voice input is not available in this browser.");
            return;
        }

        try {
            resetTranscript();
            lastTranscriptRef.current = "";
            SpeechRecognition.startListening({
                continuous: true,
                language: voice.recognitionLang,
            });
            setSystemStatus("listening");
            setIsVoiceEnabled(true);
        } catch (error) {
            console.error("Error starting speech recognition:", error);
        }
    }, [voice, nativeStt, pipelineStt, listenWithPipeline, addSystemMessage, resetTranscript]);

    // al terminar de hablar el asistente se vuelve a escuchar
    const handleSpeechEnd = useCallback(() => {
        if (isMounted.current && voiceEnabledRef.current) {
            setIsSpeaking(false);
            setSystemStatus("idle");
            // con "pulsar para hablar" se espera a que se toque el micrófono
            if (voiceSettingsRef.current.pushToTalk) return;

            setTimeout(() => {
                if (isMounted.current && voiceEnabledRef.current) {
                    startListening();
                }
            }, 800);
        }
    }, [startListening]);

    const { speak, cancel } = useSpeechSynthesis({ onEnd: handleSpeechEnd });

    // Texto a voz: speechSynthesis del navegador si tiene voces; si no, el audio lo genera el pipeline
    const speakAnswer = useCallback(
        (text: string, speechLang: string) => {
            if (hasSpeechSynthesisVoices() || !voiceService) {
                speak({ text, voice: speechLang });
                return;
            }
            voiceService
                .synthesize(text, speechLang)
                .then((audio) =>
                    playAudioBlob(audio, (element) => {
                        audioRef.current = element;
                    }),
                )
                .catch((error) => console.error(error))
                .finally(() => {
                    audioRef.current = null;
                    handleSpeechEnd();
                });
        },
        [speak, voiceService, handleSpeechEnd],
    );

    // Si la voz a texto del navegador falla por no tener servicio (p. ej. Chrome sin acceso al de Google),
    // se pasa a la del pipeline
    useEffect(() => {
        if (!browserSupportsSpeechRecognition) return;
        const recognition = SpeechRecognition.getRecognition() as
            | (EventTarget & { addEventListener: EventTarget["addEventListener"] })
            | null;
        if (!recognition?.addEventListener) return;
        const onError = (event: Event) => {
            const error = (event as Event & { error?: string }).error ?? "";
            if (NATIVE_STT_UNAVAILABLE_ERRORS.includes(error)) {
                console.warn(`Speech recognition of the browser not available (${error}): using the pipeline`);
                setNativeSttFailed(true);
            }
        };
        recognition.addEventListener("error", onError);
        return () => recognition.removeEventListener("error", onError);
    }, [browserSupportsSpeechRecognition]);

    useEffect(() => {
        if (nativeSttFailed && voiceEnabledRef.current) {
            SpeechRecognition.stopListening();
            if (voiceService && canRecordAudio()) void listenWithPipeline();
            else {
                voiceEnabledRef.current = false;
                setIsVoiceEnabled(false);
                setSystemStatus("idle");
                addSystemMessage("Voice input is not available in this browser.");
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [nativeSttFailed]);

    useEffect(() => {
        return () => {
            isMounted.current = false;
            SpeechRecognition.stopListening();
            recordingRef.current?.cancel();
            audioRef.current?.pause();
            setTimeout(() => {
                if ("speechSynthesis" in window) {
                    window.speechSynthesis.cancel();
                }
            }, 100);
        };
    }, []);

    // Cargar voces disponibles
    useEffect(() => {
        const loadVoices = () => {
            window.speechSynthesis.getVoices();
        };

        if (window.speechSynthesis.getVoices().length > 0) {
            loadVoices();
        } else {
            window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
            return () => window.speechSynthesis.removeEventListener("voiceschanged", loadVoices);
        }
    }, []);

    useEffect(() => {
        if (!initializedRef.current && chatMessages.length === 0) {
            initializedRef.current = true;
            setIsLoading(true);
            getVoices(chatAssistantLanguage)
                .then((voice) => {
                    setVoice(voice as IChatVoice);
                    const greetingMessage: ChatMessage = {
                        message: voice.greeting,
                        userName: "Assistant",
                        sender: "assistant",
                        time: new Date().toISOString(),
                        mcpToolCalls: [],
                    };
                    setChatMessages([greetingMessage]);
                    setLastChatMessageIndex(1); // Inicializar correctamente
                    setIsLoading(false);
                })
                .catch(() => {
                    setIsLoading(false);
                });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [chatAssistantLanguage]);

    // Manejar cambios en el transcript: cada palabra nueva reinicia la pausa (y cancela la cuenta atrás)
    useEffect(() => {
        if (!transcript || !isVoiceEnabled) return;
        if (transcript !== lastTranscriptRef.current) {
            setInput(transcript);
            lastTranscriptRef.current = transcript;
            lastChangeAtRef.current = Date.now();
            setCountdown(null);
            setSystemStatus("listening");
        }
    }, [transcript, isVoiceEnabled]);

    // envía lo dictado con el reconocimiento del navegador
    const sendSpokenText = useCallback(() => {
        const text = lastTranscriptRef.current.trim();
        if (!text) return;
        setSystemStatus("processing");
        // con "pulsar para hablar" no se sigue escuchando hasta que se vuelva a tocar el micrófono
        if (voiceSettingsRef.current.pushToTalk) SpeechRecognition.stopListening();
        sendText(text);
    }, [sendText]);
    const sendSpokenTextRef = useRef(sendSpokenText);
    sendSpokenTextRef.current = sendSpokenText;

    // Envío automático tras la pausa (reconocimiento del navegador): la pausa depende del texto (voiceTurn.ts) y,
    // pasado un instante sin palabras nuevas, se muestra la cuenta atrás
    useEffect(() => {
        if (!isVoiceEnabled || !nativeStt || systemStatus !== "listening" || voiceSettings.pushToTalk) return;
        const lang = voice?.recognitionLang ?? chatAssistantLanguage;
        const id = setInterval(() => {
            const text = lastTranscriptRef.current.trim();
            if (!text) {
                setCountdown(null);
                return;
            }
            const elapsed = Date.now() - lastChangeAtRef.current;
            const pause = turnPauseMs(text, lang, voiceSettings);
            if (elapsed >= pause) {
                setCountdown(null);
                sendSpokenTextRef.current();
                return;
            }
            setCountdown(
                elapsed < COUNTDOWN_GRACE_MS
                    ? null
                    : (elapsed - COUNTDOWN_GRACE_MS) / Math.max(1, pause - COUNTDOWN_GRACE_MS),
            );
        }, 100);
        return () => {
            clearInterval(id);
            setCountdown(null);
        };
    }, [isVoiceEnabled, nativeStt, systemStatus, voiceSettings, voice?.recognitionLang, chatAssistantLanguage]);

    const handleSend = useCallback(() => sendText(input), [input, sendText]);

    useEffect(() => {
        speakRef.current = speak;
    }, [speak]);

    useEffect(() => {
        // Solo procesar si hay mensajes nuevos
        if (chatMessages.length > lastChatMessageIndex) {
            const lastMessage = chatMessages[chatMessages.length - 1];

            if (
                lastMessage.sender === "assistant" &&
                lastMessage.message !== voice?.greeting &&
                isVoiceEnabled &&
                voice?.speechLang &&
                !isSpeaking
            ) {
                setLastChatMessageIndex(chatMessages.length);

                SpeechRecognition.stopListening();
                setSystemStatus("speaking");
                setIsSpeaking(true);

                const normalizedText = normalizeTextForSpeech(lastMessage.message);

                setTimeout(() => {
                    if (isMounted.current && voiceEnabledRef.current) {
                        speakAnswer(normalizedText, voice.speechLang);
                    }
                }, 200);
            } else {
                // Actualizar el índice incluso si no vamos a hablar
                setLastChatMessageIndex(chatMessages.length);
            }

            // Desactivar spinner cuando llega una respuesta del asistente
            if ((lastMessage.sender === "assistant" || lastMessage.sender === "system") && isLoading) {
                setIsLoading(false);
            }
            // pregunta de voz llegada del pipeline: se espera la respuesta como si se hubiera escrito aquí
            if (lastMessage.sender === "user" && lastMessage.source === "pipeline" && !isLoading) {
                setIsLoading(true);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        chatMessages.length,
        lastChatMessageIndex,
        voice?.greeting,
        voice?.speechLang,
        isVoiceEnabled,
        isSpeaking,
        isLoading,
    ]);

    const handleKeyPress = (e: KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const handleInputChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
        setInput(e.target.value);
    };

    // Auto-scroll al final
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [chatMessages, isLoading]);

    useEffect(() => {
        const handleGlobalPointerDown = (e: MouseEvent) => {
            const containerEl = containerRef.current;
            const ta = textAreaRef.current;

            if (!ta) return;

            const taIsActive = document.activeElement === ta;

            const clickedInsideChat = containerEl?.contains(e.target as Node) ?? false;
            if (taIsActive && !clickedInsideChat) {
                ta.blur();
            }
        };

        document.addEventListener("pointerdown", handleGlobalPointerDown, true);
        return () => document.removeEventListener("pointerdown", handleGlobalPointerDown, true);
    }, []);

    const stopListening = useCallback(() => {
        try {
            SpeechRecognition.stopListening();
            voiceEnabledRef.current = false;
            recordingRef.current?.cancel();
            audioRef.current?.pause();
            setIsVoiceEnabled(false);
            setSystemStatus("idle");
            setIsSpeaking(false);

            setTimeout(() => {
                cancel();
            }, 100);

            resetTranscript();
            lastTranscriptRef.current = "";
            setCountdown(null);

            setLastChatMessageIndex(chatMessages.length);
        } catch (error) {
            console.error("Error stopping speech recognition:", error);
        }
    }, [cancel, chatMessages.length, resetTranscript]);

    // ¿hay algo dicho pendiente de enviar?
    const pendingSpeech =
        isVoiceEnabled && systemStatus === "listening" && (nativeStt ? input.trim() !== "" : pipelineHeardSpeech);

    // envía ya lo dicho, sin esperar a la pausa
    const sendNow = useCallback(() => {
        setCountdown(null);
        if (nativeStt) sendSpokenText();
        else void recordingRef.current?.stop();
    }, [nativeStt, sendSpokenText]);

    // descarta lo dicho y sigue escuchando
    const discardSpeech = useCallback(() => {
        setCountdown(null);
        if (nativeStt) {
            resetTranscript();
            lastTranscriptRef.current = "";
            setInput("");
            return;
        }
        if (recordingRef.current) {
            discardRecordingRef.current = true;
            pipelineSessionRef.current++;
            setInput("");
            recordingRef.current.cancel();
        }
    }, [nativeStt, resetTranscript]);

    // Micrófono: activa el modo de voz; mientras escucha, envía lo dicho (o, si no se ha dicho nada, apaga el modo
    // de voz); con "pulsar para hablar", entre pregunta y pregunta empieza a escuchar
    const handleMicClick = useCallback(() => {
        if (!isVoiceEnabled) {
            startListening();
        } else if (pendingSpeech) {
            sendNow();
        } else if (voiceSettings.pushToTalk && systemStatus === "idle") {
            startListening();
        } else {
            stopListening();
        }
    }, [isVoiceEnabled, pendingSpeech, sendNow, voiceSettings.pushToTalk, systemStatus, startListening, stopListening]);

    const micTitle = !voiceInputAvailable
        ? "Voice input is not available in this browser"
        : !isVoiceEnabled
          ? nativeStt
              ? "Talk to the assistant"
              : "Talk to the assistant (speech recognized by the digital twin pipeline)"
          : pendingSpeech
            ? "Send now"
            : voiceSettings.pushToTalk && systemStatus === "idle"
              ? "Start talking"
              : "Turn off voice mode";

    const getStatusText = () => {
        switch (systemStatus) {
            case "listening":
                if (countdown !== null) return "Sending...";
                return voiceSettings.pushToTalk ? "Tap mic to send" : "Listening...";
            case "processing":
                return "Processing...";
            case "speaking":
                return "🔊 Speaking...";
            default:
                return isVoiceEnabled && voiceSettings.pushToTalk ? "Tap mic to talk" : "Ready";
        }
    };

    const renderMcpToolCalls = (mcpToolCalls: McpToolCall[]) => {
        if (!mcpToolCalls || mcpToolCalls.length === 0 || !showMcpTools) return null;

        return (
            <McpToolsList>
                {mcpToolCalls.map((toolCall, index) => (
                    <McpToolItem key={index}>
                        🔧 <ToolName>{toolCall.tool_name}</ToolName>
                        {toolCall.args.length > 0 && <ToolArgs>({toolCall.args})</ToolArgs>}
                    </McpToolItem>
                ))}
            </McpToolsList>
        );
    };

    const toggleMcpToolsVisibility = useCallback(() => {
        setShowMcpTools((prev) => !prev);
    }, []);

    const removeChatAssistantHistory = useCallback(() => {
        setChatMessages([]);
        setLastChatMessageIndex(0);
        setShowMcpTools(false);
        handleRemoveChatAssistantHistory();
    }, [handleRemoveChatAssistantHistory, setChatMessages]);

    // Componente para mostrar el spinner mientras se espera respuesta
    const renderLoadingMessage = () => {
        if (!isLoading) return null;

        return (
            <MessageBubble sender="assistant">
                <Label>OSI</Label>
                <MessageSpinnerContainer>
                    <MiniSpinner />
                    <ThinkingText>Thinking...</ThinkingText>
                </MessageSpinnerContainer>
            </MessageBubble>
        );
    };

    return (
        <ChatContainer ref={containerRef} style={{ width: `${containerWidth}px` }}>
            <ResizeHandle onMouseDown={handleMouseDown} style={{ cursor: isResizing ? "ew-resize" : "ew-resize" }} />
            <MessagesContainer>
                {chatMessages.map((msg, index) => (
                    <MessageBubble key={index} sender={msg.sender}>
                        <Label>
                            {msg.sender === "assistant" || msg.sender === "system" ? "OSI" : msg.userName || userName}
                            {msg.sender === "assistant" && containsLatex(msg.message) && (
                                <span style={{ marginLeft: "10px", fontSize: "0.6rem", opacity: 0.7 }}>📊 LaTeX</span>
                            )}
                        </Label>
                        <MathMessage html={msg.message} />
                        {renderMcpToolCalls(msg.mcpToolCalls)}
                    </MessageBubble>
                ))}
                {renderLoadingMessage()}
                <div ref={messagesEndRef} />
            </MessagesContainer>
            {showVoiceSettings && (
                <VoiceSettingsPanel role="group" aria-label="Voice mode settings">
                    <strong>Voice mode</strong>
                    <label aria-disabled={voiceSettings.pushToTalk}>
                        Pause before sending
                        <input
                            type="range"
                            min={MIN_PAUSE_MS / 1000}
                            max={MAX_PAUSE_MS / 1000}
                            step={0.1}
                            value={voiceSettings.pauseMs / 1000}
                            disabled={voiceSettings.pushToTalk}
                            onChange={(e) => updateVoiceSettings({ pauseMs: Number(e.target.value) * 1000 })}
                        />
                        <output>{(voiceSettings.pauseMs / 1000).toFixed(1)} s</output>
                    </label>
                    <label aria-disabled={voiceSettings.pushToTalk}>
                        <input
                            type="checkbox"
                            checked={voiceSettings.adaptivePause}
                            disabled={voiceSettings.pushToTalk}
                            onChange={(e) => updateVoiceSettings({ adaptivePause: e.target.checked })}
                        />
                        Wait longer when the sentence seems unfinished
                    </label>
                    <label>
                        <input
                            type="checkbox"
                            checked={voiceSettings.pushToTalk}
                            onChange={(e) => updateVoiceSettings({ pushToTalk: e.target.checked })}
                        />
                        Push to talk: tap the microphone to start and again to send
                    </label>
                </VoiceSettingsPanel>
            )}
            <InputContainer>
                <TextArea
                    ref={textAreaRef}
                    value={input}
                    onChange={handleInputChange}
                    onKeyPress={handleKeyPress}
                    placeholder="Type your question..."
                    disabled={isVoiceEnabled && systemStatus === "listening"}
                />
                <ButtonContainer>
                    <ButtonRow>
                        <Button onClick={handleSend} disabled={isLoading || !input.trim()}>
                            Send
                        </Button>
                    </ButtonRow>
                    <ButtonRow>
                        <ToggleButton
                            active={showMcpTools}
                            onClick={toggleMcpToolsVisibility}
                            title={showMcpTools ? "Hide MCP tools" : "Show MCP tools"}
                        >
                            <FaWrenchIcon style={{ opacity: showMcpTools ? 1 : 0.3 }} />
                        </ToggleButton>
                        <ToggleButton
                            active={showVoiceSettings}
                            onClick={() => setShowVoiceSettings((open) => !open)}
                            title="Voice mode settings"
                            aria-expanded={showVoiceSettings}
                        >
                            <FaSlidersHIcon style={{ opacity: showVoiceSettings ? 1 : 0.6 }} />
                        </ToggleButton>
                        <MicWrap>
                            <MicButton
                                active={isVoiceEnabled}
                                onClick={handleMicClick}
                                disabled={!voiceInputAvailable}
                                title={micTitle}
                                aria-label={micTitle}
                            >
                                {isVoiceEnabled ? <FaMicrophoneIcon /> : <FaMicrophoneSlashIcon />}
                            </MicButton>
                            {countdown !== null && (
                                <svg className="countdown" viewBox="0 0 38 38" aria-hidden>
                                    <circle
                                        cx="19"
                                        cy="19"
                                        r={COUNTDOWN_RADIUS}
                                        strokeDasharray={COUNTDOWN_LENGTH}
                                        strokeDashoffset={COUNTDOWN_LENGTH * Math.min(1, countdown)}
                                    />
                                </svg>
                            )}
                        </MicWrap>
                        <TrashButton
                            active={chatMessages.length > 0}
                            onClick={removeChatAssistantHistory}
                            title="Clear chat history"
                        >
                            <FaTrashAltIcon />
                        </TrashButton>
                    </ButtonRow>
                    <ButtonRow style={{ height: 24, justifyContent: "center" }}>
                        <StatusIndicator status={countdown !== null ? "processing" : systemStatus} role="status">
                            {getStatusText()}
                        </StatusIndicator>
                        {pendingSpeech && (
                            <SmallButton onClick={discardSpeech} title="Discard what was said" aria-label="Discard what was said">
                                <FaTimesIcon />
                            </SmallButton>
                        )}
                    </ButtonRow>
                </ButtonContainer>
            </InputContainer>
        </ChatContainer>
    );
};

export default ChatAssistant;
