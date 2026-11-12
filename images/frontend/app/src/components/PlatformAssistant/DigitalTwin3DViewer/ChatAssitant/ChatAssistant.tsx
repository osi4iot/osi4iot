import React, { useState, KeyboardEvent, ChangeEvent, useRef, useEffect, useCallback } from "react";
import styled from "styled-components";
import SpeechRecognition, { useSpeechRecognition } from "react-speech-recognition";
import { FaMicrophone, FaMicrophoneSlash, FaWrench, FaTrashAlt, FaSlidersH, FaTimes } from "react-icons/fa";
import { useSpeechSynthesis } from "./useSpeechSynthesis";
import { useLoggedUserLogin } from "../../../../contexts/authContext/authContext";
import { normalizeForTTS } from "./ttsNormalizer";
import { containsLatex, MathMessage } from "./MathMessage";
import { ChatChart, ChatCharts } from "./chatCharts";
import { asIcon } from "../../../../tools/icons";
import { panelColors as ic } from "../AssistantPanel/controls";
import { canRecordAudio, Recording, startRecording } from "../../../../tools/audioRecorder";
import { hasSpeechSynthesisVoices, PipelineVoiceService, playAudioBlob } from "./voiceService";
import {
    chooseSpeechToText,
    chooseTextToSpeech,
    VOICE_ENGINE_LABEL,
    VOICE_SOURCE_LABEL,
    VOICE_SOURCES,
    type VoiceEngine,
    type VoiceSource,
} from "./voiceSource";
import {
    answerVoiceLanguage,
    CHAT_LANGUAGES,
    chatLanguageBase,
    chatLanguageNative,
    chatLanguageOf,
    chatVoiceGender,
    chatVoiceLanguageOf,
    isBilingualChat,
    messageInLanguage,
    type MessageTranslation,
} from "./chatLanguages";
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

// el idioma principal del chat (chatLanguages.ts; sin idioma: inglés)
const getVoices = (lang: string) => {
    const language = chatLanguageOf(lang) ?? CHAT_LANGUAGES[0];
    return Promise.resolve({
        greeting: language.greeting,
        recognitionLang: language.recognition,
        speechLang: language.recognition,
    });
};

// el texto que se lee en voz alta en un idioma sin normalizador (ttsNormalizer: español e inglés), con el mismo
// criterio que el normalizador: una respuesta con fórmulas en bloque o matrices no se lee; las fórmulas en línea
// se quitan (sus símbolos solo se verbalizan en español e inglés) y también las marcas de Markdown
export const plainSpeechText = (text: string): string => {
    if (
        /\\\[[\s\S]*?\\\]|\$\$[\s\S]*?\$\$|\\begin\{(pmatrix|bmatrix|vmatrix|Vmatrix|matrix|array|cases|align|equation|eqnarray)\*?\}/i.test(
            text,
        )
    ) {
        return "";
    }
    return text
        .replace(/```[\s\S]*?```/g, " ")
        .replace(/\\\([\s\S]*?\\\)/g, " ")
        .replace(/(?<!\$)\$[^$\n]+\$(?!\$)/g, " ")
        .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
        .replace(/[*_#`>~]+/g, "")
        .replace(/\|/g, " ")
        .replace(/\s+/g, " ")
        .trim();
};

export interface McpToolCall {
    tool_name: string;
    args: string[];
}

export type { ChatChart } from "./chatCharts";

export interface LlmMessage {
    message: string;
    uiOpts: Record<string, any>;
    mcpToolCalls: McpToolCall[];
    // gráficas dibujadas por pipelines para la respuesta (sensor-chart)
    charts?: ChatChart[];
    sender: "user" | "assistant" | "system";
    // pregunta de voz transcrita en el pipeline: quién la hizo
    userName?: string;
    // chat bilingüe: la respuesta y la pregunta en el otro idioma
    translation?: MessageTranslation;
    questionTranslation?: MessageTranslation;
    // pregunta llegada por un canal del chat: "mobile", "telegram"
    via?: string;
}

export interface ChatMessage {
    message: string;
    userName: string;
    sender: "user" | "assistant" | "system";
    time: string;
    mcpToolCalls: McpToolCall[];
    charts?: ChatChart[];
    // "pipeline": pregunta de voz (sensor "Mobile audio", nota de voz de Telegram) transcrita en el pipeline, que
    // ya la ha enviado al AI Agent: el visor solo la muestra
    source?: "pipeline";
    // chat bilingüe: el mensaje en el otro idioma
    translation?: MessageTranslation;
    // pregunta llegada por un canal del chat: "mobile" (nota de voz del móvil), "telegram"
    via?: string;
}

export interface IChatVoice {
    greeting: string;
    recognitionLang: string;
    speechLang: string;
}

// Debajo de la barra superior del visor, dentro del área del visor
// Integrado como pestaña del panel del asistente: ocupa todo el panel y toma sus colores. Solo cambia el contenedor y el
// fondo de las burbujas: MathMessage (LaTeX, tablas Markdown) y las gráficas se muestran igual.
const EmbeddedContainer = styled.div`
    position: relative;
    flex: 1;
    min-height: 0;
    min-width: 0;
    display: flex;
    flex-direction: column;
    background: transparent;
    font-family: Roboto, "Helvetica Neue", Arial, sans-serif;
    color: ${ic.text};
`;

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

const MessageBubble = styled.div<MessageBubbleProps & { $embedded?: boolean }>`
    padding: 8px 12px;
    border-radius: ${({ $embedded }) => ($embedded ? "14px" : "20px")};
    max-width: ${({ $embedded }) => ($embedded ? "94%" : "90%")};
    word-wrap: break-word;
    align-self: ${({ sender }) => (sender === "user" ? "flex-end" : "flex-start")};
    background-color: ${({ sender, $embedded }) =>
        $embedded
            ? sender === "user"
                ? "rgba(61, 130, 240, 0.22)"
                : sender === "assistant"
                  ? ic.raised
                  : "rgba(165, 70, 70, 0.85)"
            : sender === "user"
              ? "#3a3a3a"
              : sender === "assistant"
                ? "#555"
                : "#a54646ff"};
    border: ${({ $embedded, sender }) =>
        $embedded ? `1px solid ${sender === "user" ? "rgba(61, 130, 240, 0.35)" : ic.border}` : "none"};
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
const InputContainer = styled.div<{ $embedded?: boolean }>`
    display: flex;
    border-top: 1px solid ${({ $embedded }) => ($embedded ? ic.divider : "#444")};
    padding: 8px;
    background-color: ${({ $embedded }) => ($embedded ? "rgba(0, 0, 0, 0.18)" : "#1f1f1f")};
    font-size: 0.9rem;
    gap: 10px;
    align-items: stretch;
`;

const TextArea = styled.textarea<{ $embedded?: boolean }>`
    flex: 1;
    align-self: stretch;
    min-width: 0;
    min-height: 80px;
    margin: 0;
    padding: 8px;
    border: 1px solid ${({ $embedded }) => ($embedded ? ic.border : "#444")};
    border-radius: ${({ $embedded }) => ($embedded ? "8px" : "4px")};
    background-color: ${({ $embedded }) => ($embedded ? ic.field : "#2c2c2c")};

    &:focus {
        outline: none;
        border-color: ${({ $embedded }) => ($embedded ? ic.accent : "#3274d9")};
    }

    /* barra de desplazamiento oscura, como el resto del panel (no la blanca del sistema) */
    &::-webkit-scrollbar {
        width: 8px;
    }
    &::-webkit-scrollbar-track {
        background: transparent;
    }
    &::-webkit-scrollbar-thumb {
        background: #3a3f47;
        border-radius: 4px;
    }
    &::-webkit-scrollbar-thumb:hover {
        background: #4b5563;
    }
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

const VoiceSourceSelect = styled.select`
    margin-left: auto;
    background: #2b2b2b;
    color: #ddd;
    border: 1px solid #555;
    border-radius: 4px;
    padding: 2px 4px;
    font-size: 0.75rem;
`;

// por dónde llegó la pregunta (canales del chat)
const ViaTag = styled.span`
    margin-left: 8px;
    font-size: 0.6rem;
    font-weight: 400;
    opacity: 0.7;
`;

// chat bilingüe: el mensaje en el otro idioma, debajo del original
const TranslationBlock = styled.div`
    margin-top: 8px;
    padding-top: 6px;
    border-top: 1px dashed rgba(255, 255, 255, 0.25);
    opacity: 0.92;
    font-size: 0.95em;
`;

const TranslationLabel = styled.div`
    font-size: 0.62rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    opacity: 0.6;
    margin-bottom: 2px;
`;

// el idioma en que escucha el micrófono (chat bilingüe con el reconocimiento del navegador)
const MicLanguageButton = styled.button`
    margin-left: 6px;
    padding: 0 6px;
    height: 20px;
    border-radius: 4px;
    border: 1px solid #555;
    background: #2b2b2b;
    color: #ddd;
    font-size: 0.65rem;
    cursor: pointer;
    flex-shrink: 0;
    white-space: nowrap;

    &:hover {
        border-color: #3274d9;
    }
`;

const StatusText = styled.span`
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
`;

// de dónde sale la voz a texto: el navegador o el pipeline del gemelo
const SttSource = styled.span`
    margin-left: 6px;
    padding: 0 5px;
    border-radius: 3px;
    background: rgba(0, 0, 0, 0.25);
    font-size: 0.6rem;
    line-height: 16px;
    letter-spacing: 0.02em;
    flex-shrink: 0;
    cursor: help;
`;

interface ChatAssistantProps {
    chatMessages: ChatMessage[];
    setChatMessages: (messages: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
    chatAssistantLanguage: string;
    // chat bilingüe: el segundo idioma ("none") y en qué idioma se leen las respuestas
    chatAssistantSecondLanguage?: string;
    chatAssistantVoiceLanguage?: string;
    handleRemoveChatAssistantHistory: () => void;
    // voz a texto y texto a voz con el pipeline del gemelo digital, cuando el navegador no los ofrece
    voiceService?: PipelineVoiceService | null;
    // pestaña del panel del asistente en lugar de panel flotante; visible: si la pestaña está a la vista
    embedded?: boolean;
    visible?: boolean;
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
    chatAssistantSecondLanguage = "none",
    chatAssistantVoiceLanguage = "question",
    handleRemoveChatAssistantHistory,
    voiceService = null,
    embedded = false,
    visible = true,
}) => {
    const isMounted = useRef(true);
    const userName = useLoggedUserLogin();
    const [input, setInput] = useState<string>("");
    const [showMcpTools, setShowMcpTools] = useState<boolean>(false);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const messagesRef = useRef<HTMLDivElement>(null);
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
    // Chat bilingüe (chatLanguages.ts): los dos idiomas, y en cuál escucha el micrófono con el reconocimiento del
    // navegador (que entiende un idioma a la vez; el del pipeline detecta el idioma solo)
    const bilingual = isBilingualChat(chatAssistantLanguage, chatAssistantSecondLanguage);
    const primaryCode = chatLanguageOf(chatAssistantLanguage)?.code ?? CHAT_LANGUAGES[0].code;
    const secondCode = chatLanguageOf(chatAssistantSecondLanguage)?.code ?? "";
    // "auto": el idioma lo detecta el pipeline (entre los dos del chat); el navegador escucha entonces el principal
    const [micLanguage, setMicLanguage] = useState<"auto" | "primary" | "secondary">("auto");
    const recognitionLang =
        bilingual && micLanguage === "secondary"
            ? (chatLanguageOf(secondCode)?.recognition ?? secondCode)
            : (voice?.recognitionLang ?? CHAT_LANGUAGES[0].recognition);
    const recognitionLangRef = useRef(recognitionLang);
    recognitionLangRef.current = recognitionLang;
    // lo que se dice al pipeline: en el chat bilingüe, que detecte el idioma
    const pipelineSttLangRef = useRef("");
    pipelineSttLangRef.current = bilingual && micLanguage === "auto" ? "auto" : recognitionLang;
    const textAreaRef = useRef<HTMLTextAreaElement | null>(null);

    const [voiceSettings, updateVoiceSettings] = useVoiceTurnSettings();
    // Voz a texto: la del navegador o grabación + transcripción en el pipeline, según los ajustes (voiceSource.ts);
    // si la del navegador falla, la del pipeline
    const [nativeSttFailed, setNativeSttFailed] = useState(false);
    // el error del navegador por el que se pasó al pipeline (para el aviso en el chat)
    const nativeSttErrorRef = useRef("");
    const speechToText = chooseSpeechToText(voiceSettings.speechToText, {
        browser: browserSupportsSpeechRecognition && !nativeSttFailed,
        pipeline: !!voiceService && canRecordAudio(),
    });
    const nativeStt = speechToText === "browser";
    const pipelineStt = speechToText === "pipeline";
    // Texto a voz: speechSynthesis del navegador o el audio del pipeline (las voces del navegador llegan tarde:
    // voicesLoaded vuelve a calcularlo cuando están)
    const [, setVoicesLoaded] = useState(0);
    const textToSpeechOf = useCallback(
        (setting: VoiceSource): VoiceEngine =>
            chooseTextToSpeech(setting, { browser: hasSpeechSynthesisVoices(), pipeline: !!voiceService }),
        [voiceService],
    );
    const textToSpeech = textToSpeechOf(voiceSettings.textToSpeech);
    const voiceInputAvailable = nativeStt || pipelineStt;
    const recordingRef = useRef<Recording | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const voiceEnabledRef = useRef(false);
    useEffect(() => {
        voiceEnabledRef.current = isVoiceEnabled;
    }, [isVoiceEnabled]);

    // Fin de la pregunta hablada (voiceTurn.ts): pausa configurable y adaptativa, cuenta atrás visible (0..1) que
    // se cancela al volver a hablar, y modo "pulsar para hablar"
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
        (text: string, language?: string): string => {
            const lang = language ?? chatAssistantLanguage;
            if (!["es", "en"].includes(chatLanguageBase(lang))) return plainSpeechText(text);
            try {
                const normalizedText = normalizeForTTS(text, lang, "physics");
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
        const lang = pipelineSttLangRef.current;
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
                .transcribe(snapshot, pipelineSttLangRef.current)
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
            const text = await voiceService.transcribe(audio, pipelineSttLangRef.current);
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
                language: recognitionLangRef.current,
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

    // Texto a voz: speechSynthesis del navegador o el audio que genera el pipeline, según los ajustes
    // ya se avisó de que el pipeline no devuelve la voz
    const ttsFailureShownRef = useRef(false);
    const speakAnswer = useCallback(
        (text: string, speechLang: string) => {
            if (!voiceService || textToSpeechOf(voiceSettingsRef.current.textToSpeech) === "browser") {
                speak({ text, voice: speechLang });
                return;
            }
            voiceService
                .synthesize(text, speechLang, chatVoiceGender(chatAssistantLanguage))
                .then((audio) =>
                    playAudioBlob(audio, (element) => {
                        audioRef.current = element;
                    }),
                )
                .then(() => {
                    ttsFailureShownRef.current = false;
                    audioRef.current = null;
                    handleSpeechEnd();
                })
                .catch((error) => {
                    console.error(error);
                    audioRef.current = null;
                    // se avisa una vez (no en cada respuesta mientras siga fallando)
                    if (!ttsFailureShownRef.current) {
                        ttsFailureShownRef.current = true;
                        const voices = hasSpeechSynthesisVoices();
                        addSystemMessage(
                            `${error instanceof Error ? error.message : String(error)}.` +
                                (voices ? " The answers are read with the voices of the browser meanwhile." : ""),
                        );
                    }
                    // la respuesta se lee igualmente con la voz del navegador, si tiene (al terminar, handleSpeechEnd)
                    if (voiceEnabledRef.current && hasSpeechSynthesisVoices()) speak({ text, voice: speechLang });
                    else handleSpeechEnd();
                });
        },
        [speak, voiceService, handleSpeechEnd, textToSpeechOf, addSystemMessage, chatAssistantLanguage],
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
                nativeSttErrorRef.current = error;
                setNativeSttFailed(true);
            }
        };
        recognition.addEventListener("error", onError);
        return () => recognition.removeEventListener("error", onError);
    }, [browserSupportsSpeechRecognition]);

    useEffect(() => {
        if (nativeSttFailed && voiceEnabledRef.current) {
            SpeechRecognition.stopListening();
            const reason = nativeSttErrorRef.current ? ` (${nativeSttErrorRef.current})` : "";
            if (voiceService && canRecordAudio()) {
                addSystemMessage(
                    `The speech recognition of the browser is not available${reason}: what you say is now recognized by the digital twin pipeline.`,
                );
                void listenWithPipeline();
            } else {
                voiceEnabledRef.current = false;
                setIsVoiceEnabled(false);
                setSystemStatus("idle");
                addSystemMessage(`The speech recognition of the browser is not available${reason}, and the digital twin has no voice service: voice input is not available.`);
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
        // navegadores sin síntesis de voz: el chat funciona igual, sin leer las respuestas
        if (typeof window === "undefined" || !window.speechSynthesis) return;
        const loadVoices = () => {
            if (window.speechSynthesis.getVoices().length > 0) setVoicesLoaded((n) => n + 1);
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
                    const second = bilingual ? chatLanguageOf(secondCode) : null;
                    const greetingMessage: ChatMessage = {
                        message: voice.greeting,
                        userName: "Assistant",
                        sender: "assistant",
                        time: new Date().toISOString(),
                        mcpToolCalls: [],
                        ...(second
                            ? { translation: { language: primaryCode, translatedLanguage: second.code, message: second.greeting } }
                            : {}),
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

    // chat bilingüe: al cambiar el idioma del micrófono mientras escucha el navegador, se vuelve a empezar en el nuevo
    useEffect(() => {
        if (!voiceEnabledRef.current || !nativeStt) return;
        try {
            SpeechRecognition.abortListening();
            resetTranscript();
            lastTranscriptRef.current = "";
            setInput("");
            void SpeechRecognition.startListening({ continuous: true, language: recognitionLangRef.current });
        } catch (error) {
            console.error("Error changing the language of speech recognition:", error);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [micLanguage]);

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
        const lang = recognitionLangRef.current;
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

                // chat bilingüe: la respuesta en el idioma configurado (el de la pregunta, el principal o el segundo)
                let spokenText = lastMessage.message;
                let spokenLang = voice.speechLang;
                if (bilingual) {
                    const question = [...chatMessages].reverse().find((m) => m.sender === "user");
                    const target = answerVoiceLanguage(
                        chatVoiceLanguageOf(chatAssistantVoiceLanguage),
                        primaryCode,
                        secondCode,
                        question?.translation?.language,
                    );
                    spokenText = messageInLanguage(lastMessage.message, lastMessage.translation, target).text;
                    spokenLang = chatLanguageOf(target)?.recognition ?? target;
                }
                const normalizedText = normalizeTextForSpeech(spokenText, spokenLang);

                setTimeout(() => {
                    if (isMounted.current && voiceEnabledRef.current) {
                        speakAnswer(normalizedText, spokenLang);
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

    // Auto-scroll al final (también al volver a la pestaña del chat). Se desplaza solo la lista de mensajes:
    // scrollIntoView movería también el panel del asistente que la contiene.
    useEffect(() => {
        if (!visible) return;
        const list = messagesRef.current;
        if (list && typeof list.scrollTo === "function") {
            list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
        } else if (list) {
            list.scrollTop = list.scrollHeight;
        }
    }, [chatMessages, isLoading, visible]);

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
    const Container = embedded ? EmbeddedContainer : ChatContainer;

    const renderLoadingMessage = () => {
        if (!isLoading) return null;

        return (
            <MessageBubble sender="assistant" $embedded={embedded}>
                <Label>OSI</Label>
                <MessageSpinnerContainer>
                    <MiniSpinner />
                    <ThinkingText>Thinking...</ThinkingText>
                </MessageSpinnerContainer>
            </MessageBubble>
        );
    };

    return (
        <Container
            ref={containerRef}
            style={embedded ? undefined : { width: `${containerWidth}px` }}
            data-testid={embedded ? "chat-assistant-embedded" : "chat-assistant"}
        >
            {!embedded && (
                <ResizeHandle onMouseDown={handleMouseDown} style={{ cursor: isResizing ? "ew-resize" : "ew-resize" }} />
            )}
            <MessagesContainer ref={messagesRef}>
                {chatMessages.map((msg, index) => (
                    <MessageBubble key={index} sender={msg.sender} $embedded={embedded}>
                        <Label>
                            {msg.sender === "assistant" || msg.sender === "system" ? "OSI" : msg.userName || userName}
                            {msg.via && (
                                <ViaTag>{msg.via === "mobile" ? "📱 Mobile" : msg.via === "telegram" ? "✈️ Telegram" : msg.via}</ViaTag>
                            )}
                            {msg.sender === "assistant" && containsLatex(msg.message) && (
                                <span style={{ marginLeft: "10px", fontSize: "0.6rem", opacity: 0.7 }}>📊 LaTeX</span>
                            )}
                        </Label>
                        <MathMessage html={msg.message} />
                        {msg.translation && (
                            <TranslationBlock lang={msg.translation.translatedLanguage}>
                                <TranslationLabel>{chatLanguageNative(msg.translation.translatedLanguage)}</TranslationLabel>
                                <MathMessage html={msg.translation.message} />
                            </TranslationBlock>
                        )}
                        <ChatCharts charts={msg.charts} />
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
                    <label>
                        Speech to text
                        <VoiceSourceSelect
                            value={voiceSettings.speechToText}
                            onChange={(e) => {
                                // lo que se está escuchando lo hacía el otro: se para el modo voz
                                if (isVoiceEnabled) stopListening();
                                updateVoiceSettings({ speechToText: e.target.value as VoiceSource });
                            }}
                        >
                            {VOICE_SOURCES.map((source) => (
                                <option key={source} value={source}>
                                    {source === "auto" ? `Auto (${speechToText ? VOICE_ENGINE_LABEL[speechToText] : "none"})` : VOICE_SOURCE_LABEL[source]}
                                </option>
                            ))}
                        </VoiceSourceSelect>
                    </label>
                    <label>
                        Text to speech
                        <VoiceSourceSelect
                            value={voiceSettings.textToSpeech}
                            onChange={(e) => updateVoiceSettings({ textToSpeech: e.target.value as VoiceSource })}
                        >
                            {VOICE_SOURCES.map((source) => (
                                <option key={source} value={source}>
                                    {source === "auto" ? `Auto (${VOICE_ENGINE_LABEL[textToSpeech]})` : VOICE_SOURCE_LABEL[source]}
                                </option>
                            ))}
                        </VoiceSourceSelect>
                    </label>
                </VoiceSettingsPanel>
            )}
            <InputContainer $embedded={embedded}>
                <TextArea
                    $embedded={embedded}
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
                        <StatusIndicator
                            status={countdown !== null ? "processing" : systemStatus}
                            role="status"
                            style={bilingual && speechToText ? { flex: "1 1 auto" } : undefined}
                        >
                            <StatusText>{getStatusText()}</StatusText>
                            {speechToText && !bilingual && (
                                <SttSource
                                    title={
                                        (nativeStt
                                            ? "Speech to text: the speech recognition of the browser (Web Speech API)"
                                            : "Speech to text: the digital twin pipeline (voice service on dev2dtm)") +
                                        "\n" +
                                        (textToSpeech === "browser"
                                            ? "Text to speech: the voices of the browser"
                                            : "Text to speech: the digital twin pipeline (voice service on dev2dtm)")
                                    }
                                >
                                    {speechToText === textToSpeech
                                        ? VOICE_ENGINE_LABEL[speechToText]
                                        : `🎤 ${VOICE_ENGINE_LABEL[speechToText]} · 🔊 ${VOICE_ENGINE_LABEL[textToSpeech]}`}
                                </SttSource>
                            )}
                        </StatusIndicator>
                        {bilingual && (nativeStt || pipelineStt) && (
                            <MicLanguageButton
                                type="button"
                                onClick={() =>
                                    setMicLanguage((m) =>
                                        nativeStt
                                            ? m === "secondary"
                                                ? "primary"
                                                : "secondary"
                                            : m === "auto"
                                              ? "primary"
                                              : m === "primary"
                                                ? "secondary"
                                                : "auto",
                                    )
                                }
                                title={
                                    nativeStt || micLanguage !== "auto"
                                        ? `The microphone listens in ${chatLanguageNative(
                                              micLanguage === "secondary" ? secondCode : primaryCode,
                                          )}. Click to change it`
                                        : `The language is detected (${chatLanguageNative(primaryCode)} or ${chatLanguageNative(
                                              secondCode,
                                          )}). Click to fix one: then it is never mistaken`
                                }
                                aria-label="Language of the microphone"
                            >
                                🎤{" "}
                                {!nativeStt && micLanguage === "auto"
                                    ? "Auto"
                                    : chatLanguageNative(micLanguage === "secondary" ? secondCode : primaryCode)}
                            </MicLanguageButton>
                        )}
                        {pendingSpeech && (
                            <SmallButton onClick={discardSpeech} title="Discard what was said" aria-label="Discard what was said">
                                <FaTimesIcon />
                            </SmallButton>
                        )}
                    </ButtonRow>
                </ButtonContainer>
            </InputContainer>
        </Container>
    );
};

export default ChatAssistant;
