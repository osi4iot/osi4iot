import React, { useState, KeyboardEvent, ChangeEvent, useRef, useEffect, useCallback } from "react";
import styled from "styled-components";
import SpeechRecognition, { useSpeechRecognition } from "react-speech-recognition";
import { FaMicrophone, FaMicrophoneSlash } from "react-icons/fa";
import katex from "katex";
import "katex/dist/katex.min.css";
import { useSpeechSynthesis } from "./useSpeechSynthesis";
import { useLoggedUserLogin } from "../../../../contexts/authContext/authContext";

const getVoices = (lang: string) => {
    // Detectar el idioma y configurar apropiadamente
    const isSpanish = lang.includes('es');
    
    return Promise.resolve({ 
        greeting: isSpanish ? "¡Hola! Soy OSI. ¿En qué puedo ayudarte?" : "Hello! I'm OSI. How can I help you?",
        recognitionLang: isSpanish ? "es-ES" : "en-US",
        speechLang: isSpanish ? "es-ES" : "en-US"
    });
};

export interface LlmMessage {
    message: string;
    uiOpts: Record<string, any>;
    sender: "user" | "assistant";
}

export interface ChatMessage {
    message: string;
    userName: string;
    sender: "user" | "assistant";
    time: string;
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
    height: calc(100vh - 330px);
    background-color: #2c2c2c;
    border: 1px solid #444;
    border-radius: 8px;
    overflow: hidden;
    font-family: Arial, sans-serif;
    display: flex;
    flex-direction: column;
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
    sender: "user" | "assistant";
}

const MessageBubble = styled.div<MessageBubbleProps>`
    padding: 8px 12px;
    border-radius: 20px;
    max-width: 80%;
    word-wrap: break-word;
    align-self: ${({ sender }) => (sender === "user" ? "flex-end" : "flex-start")};
    background-color: ${({ sender }) => (sender === "user" ? "#3a3a3a" : "#555")};
    color: #f1f1f1;
    position: relative;
    font-size: 0.9rem;
`;

const Label = styled.span`
    font-size: 0.75rem;
    font-weight: bold;
    margin-bottom: 4px;
    display: block;
    color: #bbb;
`;

const MessageContent = styled.div`
    .katex {
        font-size: 1em;
    }
    .katex-display {
        margin: 0.5em 0;
        text-align: center;
    }
    white-space: pre-wrap;
    word-break: break-word;
    
    /* Mejorar la apariencia de las matrices */
    .katex .mord {
        margin: 0;
    }
    
    .katex .arraycolsep {
        width: 0.5em;
    }
`;

const InputContainer = styled.div`
    display: flex;
    border-top: 1px solid #444;
    padding: 8px;
    background-color: #1f1f1f;
    font-size: 0.9rem;
    align-items: center;
`;

const Input = styled.input`
    flex: 1;
    padding: 8px;
    border: 1px solid #444;
    border-radius: 4px;
    background-color: #2c2c2c;
    color: #f1f1f1;
`;

const Button = styled.button`
    margin-left: 10px;
    padding: 8px 16px;
    border: none;
    color: #fff;
    cursor: pointer;
    border: 5px solid #141619;
    border-radius: 10px;
    background-color: #3274d9;
    &:hover {
        background: #2461c0;
    }
`;

const MicButton = styled.button<{ active: boolean }>`
    margin-left: 10px;
    padding: 8px;
    border: none;
    border-radius: 50%;
    background-color: ${({ active }) => (active ? "#c0392b" : "#3274d9")};
    color: #fff;
    cursor: pointer;
    font-size: 1rem;

    &:hover {
        background-color: ${({ active }) => (active ? "#8f2b21" : "#2461c0")};
    }
`;

const StatusIndicator = styled.div<{ status: string }>`
    margin-left: 5px;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 0.7rem;
    background-color: ${({ status }) => {
        switch (status) {
            case 'listening': return '#27ae60';
            case 'processing': return '#f39c12';
            case 'speaking': return '#e74c3c';
            default: return '#95a5a6';
        }
    }};
    color: white;
`;

const renderLatexMessage = (message: string): string => {
    try {
        // Primero procesar bloques de display math \\[ ... \\]
        let rendered = message.replace(/\\\\?\[([\s\S]*?)\\\\?\]/g, (match, latex) => {
            try {
                return katex.renderToString(latex.trim(), { 
                    displayMode: true,
                    throwOnError: false 
                });
            } catch (e) {
                console.error('Error rendering display LaTeX:', e);
                return match;
            }
        });

        // Luego procesar math inline \\( ... \\)
        rendered = rendered.replace(/\\\\?\(([\s\S]*?)\\\\?\)/g, (match, latex) => {
            try {
                return katex.renderToString(latex.trim(), { 
                    displayMode: false,
                    throwOnError: false 
                });
            } catch (e) {
                console.error('Error rendering inline LaTeX:', e);
                return match;
            }
        });

        // También procesar bloques $ ... $ para compatibilidad
        rendered = rendered.replace(/\$\$([\s\S]*?)\$\$/g, (match, latex) => {
            try {
                return katex.renderToString(latex.trim(), { 
                    displayMode: true,
                    throwOnError: false 
                });
            } catch (e) {
                console.error('Error rendering $ LaTeX:', e);
                return match;
            }
        });

        // Y math inline $ ... $
        rendered = rendered.replace(/\$([^$\n]+?)\$/g, (match, latex) => {
            try {
                return katex.renderToString(latex.trim(), { 
                    displayMode: false,
                    throwOnError: false 
                });
            } catch (e) {
                console.error('Error rendering $ LaTeX:', e);
                return match;
            }
        });

        return rendered;
    } catch (error) {
        console.error('Error rendering LaTeX:', error);
        return message;
    }
};

interface ChatAssistantProps {
    chatMessages: ChatMessage[];
    setChatMessages: (messages: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
    chatAssistantLanguage: string;
}

const ChatAssistant: React.FC<ChatAssistantProps> = ({ chatMessages, setChatMessages, chatAssistantLanguage }) => {
    const isMounted = useRef(true);
    const userName = useLoggedUserLogin();
    const [input, setInput] = useState<string>("");
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const { transcript, resetTranscript, browserSupportsSpeechRecognition } = useSpeechRecognition();
    const [isVoiceEnabled, setIsVoiceEnabled] = useState<boolean>(false);
    const [systemStatus, setSystemStatus] = useState<'idle' | 'listening' | 'processing' | 'speaking'>('idle');
    const lastTranscriptRef = useRef<string>("");
    const processingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const handleSendRef = useRef<() => void>();
    const speakRef = useRef<(params: { text: string; voice: string }) => void>();
    const initializedRef = useRef<boolean>(false);
    
    const [voice, setVoice] = useState<IChatVoice | null>(null);

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
                language: voice.recognitionLang 
            });
            setSystemStatus('listening');
            setIsVoiceEnabled(true);
        } catch (error) {
            console.error("Error starting speech recognition:", error);
        }
    }, [browserSupportsSpeechRecognition, voice, resetTranscript]);

    const { speak, cancel } = useSpeechSynthesis({
        onEnd: useCallback(() => {
            if (isMounted.current && isVoiceEnabled) {
                setSystemStatus('idle');
                // Esperar un poco antes de volver a escuchar
                setTimeout(() => {
                    if (isMounted.current && isVoiceEnabled) {
                        startListening();
                    }
                }, 500);
            }
        }, [isVoiceEnabled, startListening]),
    });

    // Cleanup al desmontar
    useEffect(() => {
        return () => {
            isMounted.current = false;
            if (processingTimeoutRef.current) {
                clearTimeout(processingTimeoutRef.current);
            }
            SpeechRecognition.stopListening();
        };
    }, []); // Sin dependencias para evitar loops

    // Cargar voces disponibles
    useEffect(() => {
        const loadVoices = () => {
            window.speechSynthesis.getVoices();
        };

        // Las voces pueden no estar disponibles inmediatamente
        if (window.speechSynthesis.getVoices().length > 0) {
            loadVoices();
        } else {
            window.speechSynthesis.addEventListener('voiceschanged', loadVoices);
            return () => window.speechSynthesis.removeEventListener('voiceschanged', loadVoices);
        }
    }, []);

    // Inicializar voz de saludo
    useEffect(() => {
        if (!initializedRef.current && chatMessages.length === 0) {
            initializedRef.current = true;
            getVoices(chatAssistantLanguage).then((voice) => {
                setVoice(voice as IChatVoice);
                const greetingMessage: ChatMessage = {
                    message: voice.greeting,
                    userName: "Assistant",
                    sender: "assistant",
                    time: new Date().toISOString(),
                };
                setChatMessages([greetingMessage]);
            });
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [chatAssistantLanguage]); // Removido setChatMessages y chatMessages.length

    // Manejar cambios en el transcript
    useEffect(() => {
        if (!transcript || !isVoiceEnabled) return;

        // Limpiar timeout anterior
        if (processingTimeoutRef.current) {
            clearTimeout(processingTimeoutRef.current);
        }

        // Si el transcript cambió, actualizar el input
        if (transcript !== lastTranscriptRef.current) {
            setInput(transcript);
            lastTranscriptRef.current = transcript;
            setSystemStatus('listening');
        }

        // Esperar 1 segundo de silencio para procesar
        processingTimeoutRef.current = setTimeout(() => {
            if (transcript.trim() && transcript === lastTranscriptRef.current && isVoiceEnabled) {
                setSystemStatus('processing');
                handleSendRef.current?.();
            }
        }, 1000);

    }, [transcript, isVoiceEnabled]); // Removido handleSend de las dependencias

    const handleSend = useCallback(() => {
        const messageToSend = input.trim();
        if (messageToSend === "") return;

        const newMessage: ChatMessage = {
            userName: userName,
            message: messageToSend,
            sender: "user",
            time: new Date().toISOString(),
        };

        setChatMessages((prev: ChatMessage[]) => [...prev, newMessage]);
        setInput("");
        resetTranscript();
        lastTranscriptRef.current = "";

    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [input, resetTranscript]); // Removido chatMessages y setChatMessages

    // Actualizar la referencia de handleSend
    useEffect(() => {
        handleSendRef.current = handleSend;
    }, [handleSend]);

    // Actualizar la referencia de speak
    useEffect(() => {
        speakRef.current = speak;
    }, [speak]);

    // Manejar respuestas del asistente para TTS
    useEffect(() => {
        if (chatMessages.length > 0) {
            const lastMessage = chatMessages[chatMessages.length - 1];
            
            if (lastMessage.sender === "assistant" && 
                lastMessage.message !== voice?.greeting && 
                isVoiceEnabled && 
                voice?.speechLang) {
                
                SpeechRecognition.stopListening();
                setSystemStatus('speaking');
                
                speakRef.current?.({
                    text: lastMessage.message,
                    voice: voice.speechLang,
                });
            }
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [chatMessages.length, voice?.greeting, voice?.speechLang, isVoiceEnabled]); // Removido 'speak' de las dependencias

    const handleKeyPress = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
            handleSend();
        }
    };

    const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
        setInput(e.target.value);
    };

    // Auto-scroll al final
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [chatMessages]);

    const stopListening = useCallback(() => {
        try {
            SpeechRecognition.stopListening();
            setIsVoiceEnabled(false);
            setSystemStatus('idle');
            cancel();
            resetTranscript();
            lastTranscriptRef.current = "";
            
            if (processingTimeoutRef.current) {
                clearTimeout(processingTimeoutRef.current);
            }
        } catch (error) {
            console.error("Error stopping speech recognition:", error);
        }
    }, [cancel, resetTranscript]);

    const toggleVoice = useCallback(() => {
        if (isVoiceEnabled) {
            stopListening();
        } else {
            startListening();
        }
    }, [isVoiceEnabled, stopListening, startListening]);

    const getStatusText = () => {
        switch (systemStatus) {
            case 'listening': return 'Listening...';
            case 'processing': return 'Processing...';
            case 'speaking': return '🔊 Speaking...';
            default: return 'Ready';
        }
    };

    return (
        <ChatContainer>
            <MessagesContainer>
                {chatMessages.map((msg, index) => (
                    <MessageBubble key={index} sender={msg.sender}>
                        <Label>{msg.sender === "assistant" ? "OSI" : userName}</Label>
                        <MessageContent 
                            dangerouslySetInnerHTML={{ 
                                __html: renderLatexMessage(msg.message) 
                            }} 
                        />
                    </MessageBubble>
                ))}
                <div ref={messagesEndRef} />
            </MessagesContainer>
            <InputContainer>
                <Input
                    type="text"
                    value={input}
                    onChange={handleInputChange}
                    onKeyPress={handleKeyPress}
                    placeholder="Type your question..."
                    disabled={isVoiceEnabled && systemStatus === 'listening'}
                />
                <Button onClick={handleSend}>Send</Button>
                <MicButton 
                    active={isVoiceEnabled} 
                    onClick={toggleVoice}
                    disabled={!browserSupportsSpeechRecognition}
                >
                    {isVoiceEnabled ? <FaMicrophone /> : <FaMicrophoneSlash />}
                </MicButton>
                <StatusIndicator status={systemStatus}>
                    {getStatusText()}
                </StatusIndicator>
            </InputContainer>
        </ChatContainer>
    );
};

export default ChatAssistant;