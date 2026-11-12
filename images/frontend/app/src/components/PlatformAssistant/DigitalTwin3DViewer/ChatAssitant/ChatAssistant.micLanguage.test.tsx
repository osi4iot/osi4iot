import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../../../contexts/authContext/authContext", () => ({ useLoggedUserLogin: () => "tester" }));
vi.mock("../../../../tools/audioRecorder", () => ({ canRecordAudio: () => true, startRecording: vi.fn() }));

import ChatAssistant from "./ChatAssistant";
import type { PipelineVoiceService } from "./voiceService";

const voiceService: PipelineVoiceService = { transcribe: vi.fn(), synthesize: vi.fn() };

describe("ChatAssistant bilingüe: idioma del micrófono con el pipeline", () => {
    it("detects the language (Auto) and lets fix one of the two", () => {
        render(
            <ChatAssistant
                embedded
                visible
                chatMessages={[]}
                setChatMessages={() => {}}
                chatAssistantLanguage="es-ES"
                chatAssistantSecondLanguage="zh-CN"
                handleRemoveChatAssistantHistory={() => {}}
                voiceService={voiceService}
            />,
        );
        const button = screen.getByRole("button", { name: "Language of the microphone" });
        expect(button).toHaveTextContent("Auto");
        fireEvent.click(button);
        expect(button).toHaveTextContent("Español");
        fireEvent.click(button);
        expect(button).toHaveTextContent("中文");
        fireEvent.click(button);
        expect(button).toHaveTextContent("Auto");
    });
});
