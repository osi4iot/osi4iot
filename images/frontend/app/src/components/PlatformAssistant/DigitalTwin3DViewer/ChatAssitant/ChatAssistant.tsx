import React, { useState, KeyboardEvent, ChangeEvent, useRef, useEffect, useCallback } from "react";
import styled from "styled-components";
import SpeechRecognition, { useSpeechRecognition } from "react-speech-recognition";
import { FaMicrophone, FaMicrophoneSlash, FaWrench, FaTrashAlt } from "react-icons/fa";
import { useSpeechSynthesis } from "./useSpeechSynthesis";
import { useLoggedUserLogin } from "../../../../contexts/authContext/authContext";
import { normalizeForTTS } from "./ttsNormalizer";
import { containsLatex, MathMessage } from "./MathMessage";
import { asIcon } from "../../../../tools/icons";
import { canRecordAudio, Recording, startRecording } from "../../../../tools/audioRecorder";
import { hasSpeechSynthesisVoices, PipelineVoiceService, playAudioBlob } from "./voiceService";

const FaMicrophoneIcon = asIcon(FaMicrophone);
const FaMicrophoneSlashIcon = asIcon(FaMicrophoneSlash);
const FaWrenchIcon = asIcon(FaWrench);
const FaTrashAltIcon = asIcon(FaTrashAlt);

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
}

export interface ChatMessage {
    message: string;
    userName: string;
    sender: "user" | "assistant" | "system";
    time: string;
    mcpToolCalls: McpToolCall[];
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

const InputContainer = styled.div`
    display: flex;
    border-top: 1px solid #444;
    padding: 8px;
    background-color: #1f1f1f;
    font-size: 0.9rem;
    gap: 10px;
    align-items: flex-start;
`;

const TextArea = styled.textarea`
    flex: 1;
    min-height: 80px;
    padding: 8px;
    border: 1px solid #444;
    border-radius: 4px;
    background-color: #2c2c2c;
    color: #f1f1f1;
    resize: vertical;
    font-family: inherit;
    font-size: inherit;
    line-height: 1.4;
`;

const ButtonContainer = styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 90px;
`;

const ButtonRow = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-around;
    gap: 8px;
    height: 30px;
`;

const Button = styled.button`
    padding: 15px;
    border: none;
    color: #fff;
    cursor: pointer;
    border: 2px solid #141619;
    border-radius: 6px;
    background-color: #3274d9;
    font-size: 0.95rem;
    height: 26px;
    width: 95%;
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

const StatusIndicator = styled.div<{ status: string }>`
    padding: 4px 6px;
    border-radius: 4px;
    font-size: 0.65rem;
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
    height: 26px;
    display: flex;
    align-items: center;
    white-space: nowrap;
    flex-shrink: 0;
`;

interface ChatAssistantProps {
    chatMessages: ChatMessage[];
    setChatMessages: (messages: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
    chatAssistantLanguage: string;
    handleRemoveChatAssistantHistory: () => void;
    // voz a texto y texto a voz con el pipeline del gemelo digital, cuando el navegador no los ofrece
    voiceService?: PipelineVoiceService | null;
}

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
    const processingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const handleSendRef = useRef<(() => void) | undefined>(undefined);
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

        let recording: Recording;
        try {
            recording = await startRecording({ stopAfterSilenceMs: 1300, noSpeechTimeoutMs: 15000, maxDurationMs: 45000 });
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
        if (!voiceEnabledRef.current) return;

        if (!audio) {
            // nadie habló: se apaga el micrófono
            voiceEnabledRef.current = false;
            setIsVoiceEnabled(false);
            setSystemStatus("idle");
            return;
        }

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
                void listenWithPipeline();
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
            if (processingTimeoutRef.current) {
                clearTimeout(processingTimeoutRef.current);
            }
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

    // Manejar cambios en el transcript
    useEffect(() => {
        if (!transcript || !isVoiceEnabled) return;

        if (processingTimeoutRef.current) {
            clearTimeout(processingTimeoutRef.current);
        }

        if (transcript !== lastTranscriptRef.current) {
            setInput(transcript);
            lastTranscriptRef.current = transcript;
            setSystemStatus("listening");
        }

        processingTimeoutRef.current = setTimeout(() => {
            if (transcript.trim() && transcript === lastTranscriptRef.current && isVoiceEnabled) {
                setSystemStatus("processing");
                setIsLoading(true);
                handleSendRef.current?.();
            }
        }, 1000);
    }, [transcript, isVoiceEnabled]);

    const handleSend = useCallback(() => sendText(input), [input, sendText]);

    useEffect(() => {
        handleSendRef.current = handleSend;
    }, [handleSend]);

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

            if (processingTimeoutRef.current) {
                clearTimeout(processingTimeoutRef.current);
            }

            setLastChatMessageIndex(chatMessages.length);
        } catch (error) {
            console.error("Error stopping speech recognition:", error);
        }
    }, [cancel, chatMessages.length, resetTranscript]);

    const toggleVoice = useCallback(() => {
        if (isVoiceEnabled) {
            stopListening();
        } else {
            startListening();
        }
    }, [isVoiceEnabled, stopListening, startListening]);

    const getStatusText = () => {
        switch (systemStatus) {
            case "listening":
                return "Listening...";
            case "processing":
                return "Processing...";
            case "speaking":
                return "🔊 Speaking...";
            default:
                return "Ready";
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
                            {msg.sender === "assistant" || msg.sender === "system" ? "OSI" : userName}
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
                        <MicButton
                            active={isVoiceEnabled}
                            onClick={toggleVoice}
                            disabled={!voiceInputAvailable}
                            title={
                                voiceInputAvailable
                                    ? nativeStt
                                        ? "Talk to the assistant"
                                        : "Talk to the assistant (speech recognized by the digital twin pipeline)"
                                    : "Voice input is not available in this browser"
                            }
                        >
                            {isVoiceEnabled ? <FaMicrophoneIcon /> : <FaMicrophoneSlashIcon />}
                        </MicButton>
                        <StatusIndicator status={systemStatus}>{getStatusText()}</StatusIndicator>
                        <TrashButton
                            active={chatMessages.length > 0}
                            onClick={removeChatAssistantHistory}
                            title="Clear chat history"
                        >
                            <FaTrashAltIcon />
                        </TrashButton>
                    </ButtonRow>
                </ButtonContainer>
            </InputContainer>
        </ChatContainer>
    );
};

export default ChatAssistant;
