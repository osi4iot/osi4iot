import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../../../contexts/authContext/authContext", () => ({ useLoggedUserLogin: () => "tester" }));

import ChatAssistant, { ChatMessage } from "./ChatAssistant";

describe("ChatAssistant bilingüe", () => {
    it("shows each message with its translation and the microphone language", () => {
        const messages: ChatMessage[] = [
            {
                userName: "tester",
                sender: "user",
                time: "10:00:00",
                mcpToolCalls: [],
                message: "风速是多少？",
                translation: { language: "zh-CN", translatedLanguage: "es-ES", message: "¿Cuál es la velocidad del viento?" },
            },
            {
                userName: "Assistant",
                sender: "assistant",
                time: "10:00:02",
                mcpToolCalls: [],
                message: "La velocidad del viento es **12.5 m/s**.",
                translation: { language: "es-ES", translatedLanguage: "zh-CN", message: "风速为 **12.5 m/s**。" },
            },
        ];
        render(
            <ChatAssistant
                embedded
                visible
                chatMessages={messages}
                setChatMessages={() => {}}
                chatAssistantLanguage="es-ES"
                chatAssistantSecondLanguage="zh-CN"
                chatAssistantVoiceLanguage="question"
                handleRemoveChatAssistantHistory={() => {}}
            />,
        );
        expect(screen.getByText("¿Cuál es la velocidad del viento?")).toBeInTheDocument();
        expect(screen.getByText(/风速为/)).toBeInTheDocument();
        expect(screen.getAllByText("中文").length).toBeGreaterThan(0);
        expect(screen.getAllByText("Español").length).toBeGreaterThan(0);
    });
});
