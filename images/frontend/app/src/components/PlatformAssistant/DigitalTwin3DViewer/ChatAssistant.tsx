import React, { useState, KeyboardEvent, ChangeEvent, useRef, useEffect, useCallback } from "react";
import styled from "styled-components";
import SpeechRecognition, { useSpeechRecognition } from "react-speech-recognition";
import { FaMicrophone, FaMicrophoneSlash } from "react-icons/fa";
import { useLoggedUserLogin } from "../../../contexts/authContext/authContext";
import getVoices, { IChatVoice } from "../../../tools/getVoices";
import useSpeechSynthesis from "./useSpeechSynthesis";
import useInterval from "../../../tools/useInterval";

export interface ChatMessage {
    message: string;
    sender: "user" | "assistant";
}

export interface LlmMessage {
    message: string;
    uiOpts: Record<string, any>;
    sender: "user" | "assistant";
}

const ChatContainer = styled.div`
    position: fixed;
    top: 282px;
    right: 15px;
    width: 400px;
    height: calc(100vh - 335px);
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

interface ChatAssistantProps {
    chatMessages: ChatMessage[];
    setChatMessages: (messages: ChatMessage[]) => void;
    chatAssistantLanguage: string;
}

const ChatAssistant: React.FC<ChatAssistantProps> = ({ chatMessages, setChatMessages, chatAssistantLanguage }) => {
    const isMounted = useRef(true);
    const userName = useLoggedUserLogin();
    const [input, setInput] = useState<string>("");
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const { transcript, resetTranscript, browserSupportsSpeechRecognition } = useSpeechRecognition();
    const [voiceAssistant, setVoiceAssistant] = useState<boolean>(false);
    const { speak, cancel } = useSpeechSynthesis({
        onEnd: () => {
            if (isMounted.current) {
                startListening();
                setUserAction("typing");
            }
        },
    });
    const [voice, setVoice] = useState<IChatVoice | null>(null);
    const [transcriptLength, setTranscriptLength] = useState<number>(0);
    const [userAction, setUserAction] = useState<string>("none");

    useEffect(() => {
        return () => {
            isMounted.current = false;
            resetTranscript();
            cancel();
            setChatMessages([]);
            const speechRecognition = SpeechRecognition.getRecognition();
            if (speechRecognition) {
                speechRecognition.continuous = false;
                speechRecognition.abort();
            }   
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useInterval(() => {
        if (transcript.length !== 0 && transcriptLength === transcript.length) {
            setUserAction("listening");
        } else {
            setTranscriptLength(transcript.length);
            setUserAction("typing");
        }
    }, 1000);

    useEffect(() => {
        if (chatMessages.length === 0) {
            getVoices(chatAssistantLanguage).then((voice) => {
                setVoice(voice as IChatVoice);
                const grettingMessage: ChatMessage = {
                    message: voice.greeting,
                    sender: "assistant",
                };
                setChatMessages([grettingMessage]);
            });
        }

        // eslint-disable-next-line react-hooks/exhaustive-deps
        }, [setChatMessages]);


    const handleSend = useCallback(() => {
        if (input.trim() === "") return;
        const newMessage: ChatMessage = {
            message: input,
            sender: "user",
        };
        setChatMessages([...chatMessages, newMessage]);

        setInput("");
        resetTranscript();
    }, [input, chatMessages, setChatMessages, resetTranscript]);

    useEffect(() => {
        if (userAction === "listening" && transcript) {
            setInput(transcript);
            handleSend();
        }
    }, [handleSend, userAction, transcript]);

    const handleKeyPress = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
            handleSend();
        }
    };

    const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
        setInput(e.target.value);
    };

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [chatMessages]);

    const startListening = () => {
        if (browserSupportsSpeechRecognition) {
            SpeechRecognition.startListening({ continuous: true, language: voice?.recognitionLang });
            setVoiceAssistant(true);
        }
    };

    useEffect(() => {
        if (chatMessages.length > 0 && chatMessages[chatMessages.length - 1].sender === "assistant") {
            const message = chatMessages[chatMessages.length - 1].message;

            if (message !== "Hello! My name is OSI. How can I help you?") {
                if (voiceAssistant && voice?.speechLang) {
                    SpeechRecognition.stopListening();
                    setVoiceAssistant(false);
                    speak({
                        text: message,
                        voice: voice.speechLang,
                    });
                }
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [chatMessages]);

    const stopListening = () => {
        SpeechRecognition.stopListening();
        setVoiceAssistant(false);
        setUserAction("none");
        cancel();
    };

    return (
        <ChatContainer>
            <MessagesContainer>
                {chatMessages.map((msg, index) => (
                    <MessageBubble key={index} sender={msg.sender}>
                        <Label>{msg.sender === "assistant" ? "OSI" : userName}</Label>
                        {msg.message}
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
                    placeholder="Write your question..."
                />
                <Button onClick={handleSend}>Send</Button>
                <MicButton active={voiceAssistant} onClick={voiceAssistant ? stopListening : startListening}>
                    {voiceAssistant ? <FaMicrophone /> : <FaMicrophoneSlash />}
                </MicButton>
            </InputContainer>
        </ChatContainer>
    );
};

export default ChatAssistant;
