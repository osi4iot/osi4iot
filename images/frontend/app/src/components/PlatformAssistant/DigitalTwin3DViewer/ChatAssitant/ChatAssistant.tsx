import React, { useState, KeyboardEvent, ChangeEvent, useRef, useEffect, useCallback } from "react";
import styled from "styled-components";
import SpeechRecognition, { useSpeechRecognition } from "react-speech-recognition";
import { FaMicrophone, FaMicrophoneSlash, FaWrench } from "react-icons/fa";
import { useSpeechSynthesis } from "./useSpeechSynthesis";
import { useLoggedUserLogin } from "../../../../contexts/authContext/authContext";
import { normalizeForTTS } from "./ttsNormalizer";
import { containsLatex, MathMessage } from "./MathMessage";

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
    sender: "user" | "assistant" | "mcphost";
}

export interface ChatMessage {
    message: string;
    userName: string;
    sender: "user" | "assistant" | "mcphost";
    time: string;
    mcpToolCalls: McpToolCall[];
}

export interface IChatVoice {
    greeting: string;
    recognitionLang: string;
    speechLang: string;
}

const ChatContainer = styled.div`
    position: fixed;
    top: 270px;
    right: 15px;
    width: 520px;
    min-width: 520px;
    max-width: calc(100vw - 100px);
    height: calc(100vh - 330px);
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
`;

interface MessageBubbleProps {
    sender: "user" | "assistant" | "mcphost";
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
    font-size: 0.85rem;
    height: 26px;
    width: 90%;
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
}

const ChatAssistant: React.FC<ChatAssistantProps> = ({ chatMessages, setChatMessages, chatAssistantLanguage }) => {
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
    const processingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const handleSendRef = useRef<() => void>();
    const speakRef = useRef<(params: { text: string; voice: string }) => void>();
    const initializedRef = useRef<boolean>(false);
    const [lastChatMessageIndex, setLastChatMessageIndex] = useState<number>(0);
    const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
    // Estados para el redimensionado
    const [isResizing, setIsResizing] = useState(false);
    const [containerWidth, setContainerWidth] = useState(520);
    const containerRef = useRef<HTMLDivElement>(null);
    const [voice, setVoice] = useState<IChatVoice | null>(null);
    const textAreaRef = useRef<HTMLTextAreaElement | null>(null);

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
        [chatAssistantLanguage]
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
        [containerWidth]
    );

    const startListening = useCallback(() => {
        if (!browserSupportsSpeechRecognition || !voice) {
            console.warn("Speech recognition not supported or voice not loaded");
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
    }, [browserSupportsSpeechRecognition, voice, resetTranscript]);

    const { speak, cancel } = useSpeechSynthesis({
        onEnd: useCallback(() => {
            if (isMounted.current && isVoiceEnabled) {
                setIsSpeaking(false);
                setSystemStatus("idle");

                setTimeout(() => {
                    if (isMounted.current && isVoiceEnabled && !isSpeaking) {
                        startListening();
                    }
                }, 800);
            }
        }, [isVoiceEnabled, isSpeaking, startListening]),
    });

    useEffect(() => {
        return () => {
            isMounted.current = false;
            if (processingTimeoutRef.current) {
                clearTimeout(processingTimeoutRef.current);
            }
            SpeechRecognition.stopListening();
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

    const handleSend = useCallback(() => {
        const messageToSend = input.trim();
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
    }, [input, resetTranscript, userName, setChatMessages]);

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
                    if (isMounted.current && isVoiceEnabled) {
                        speak({
                            text: normalizedText,
                            voice: voice.speechLang,
                        });
                    }
                }, 200);
            } else {
                // Actualizar el índice incluso si no vamos a hablar
                setLastChatMessageIndex(chatMessages.length);
            }

            // Desactivar spinner cuando llega una respuesta del asistente
            if ((lastMessage.sender === "assistant" || lastMessage.sender === "mcphost") && isLoading) {
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
                            {msg.sender === "assistant" || msg.sender === "mcphost" ? "OSI" : userName}
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
                            <FaWrench style={{ opacity: showMcpTools ? 1 : 0.3 }} />
                        </ToggleButton>
                        <MicButton
                            active={isVoiceEnabled}
                            onClick={toggleVoice}
                            disabled={!browserSupportsSpeechRecognition}
                        >
                            {isVoiceEnabled ? <FaMicrophone /> : <FaMicrophoneSlash />}
                        </MicButton>
                        <StatusIndicator status={systemStatus}>{getStatusText()}</StatusIndicator>
                    </ButtonRow>
                </ButtonContainer>
            </InputContainer>
        </ChatContainer>
    );
};

export default ChatAssistant;
