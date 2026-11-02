import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../../../contexts/authContext/authContext", () => ({ useLoggedUserLogin: () => "tester" }));

import ChatAssistant, { ChatMessage } from "./ChatAssistant";

describe("ChatAssistant en la pestaña del panel del asistente", () => {
    it("ocupa el panel, muestra LaTeX y tablas igual y añade la pregunta escrita", () => {
        const messages: ChatMessage[] = [
            {
                userName: "Assistant",
                sender: "assistant",
                time: "10:00:00",
                mcpToolCalls: [],
                message: "La potencia es $P = \\\\frac{1}{2}\\\\rho A v^3$\n\n| a | b |\n|---|---|\n| 1 | 2 |",
            },
        ];
        let latest = messages;
        const setChatMessages = vi.fn((next: any) => {
            latest = typeof next === "function" ? next(latest) : next;
        });
        render(
            <ChatAssistant
                embedded
                visible
                chatMessages={messages}
                setChatMessages={setChatMessages}
                chatAssistantLanguage="es-ES"
                handleRemoveChatAssistantHistory={() => {}}
            />,
        );
        const root = screen.getByTestId("chat-assistant-embedded");
        expect(root.querySelector(".md-table, table")).not.toBeNull();
        expect(root.querySelector(".katex")).not.toBeNull();
        fireEvent.change(screen.getByPlaceholderText("Type your question..."), { target: { value: "Hola" } });
        fireEvent.click(screen.getByRole("button", { name: "Send" }));
        expect(latest.at(-1)).toMatchObject({ sender: "user", message: "Hola", userName: "tester" });
    });
});
