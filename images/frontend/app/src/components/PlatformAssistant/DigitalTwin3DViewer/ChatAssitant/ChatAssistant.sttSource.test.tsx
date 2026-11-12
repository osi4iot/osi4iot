import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../../../contexts/authContext/authContext", () => ({ useLoggedUserLogin: () => "tester" }));
// jsdom no tiene MediaRecorder: se hace como si el navegador pudiera grabar
vi.mock("../../../../tools/audioRecorder", () => ({ canRecordAudio: () => true, startRecording: vi.fn() }));

import ChatAssistant from "./ChatAssistant";
import type { PipelineVoiceService } from "./voiceService";

const voiceService: PipelineVoiceService = { transcribe: vi.fn(), synthesize: vi.fn() };

const renderChat = (service: PipelineVoiceService | null) =>
    render(
        <ChatAssistant
            embedded
            visible
            chatMessages={[]}
            setChatMessages={() => {}}
            chatAssistantLanguage="es-ES"
            handleRemoveChatAssistantHistory={() => {}}
            voiceService={service}
        />,
    );

describe("ChatAssistant: de dónde sale la voz a texto", () => {
    it("sin Web Speech API (jsdom) y con el servicio de voz del gemelo: Pipeline", () => {
        renderChat(voiceService);
        const status = screen.getByRole("status");
        expect(status).toHaveTextContent("Pipeline");
        expect(screen.getByTitle(/Speech to text: the digital twin pipeline/)).toBeInTheDocument();
    });

    it("sin ninguna de las dos: no se indica", () => {
        renderChat(null);
        expect(screen.getByRole("status")).not.toHaveTextContent(/Browser|Pipeline/);
    });
});
