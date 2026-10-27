import { describe, expect, it, vi } from "vitest";
import type { NatsConnection } from "@nats-io/nats-core";
import { createPipelineVoiceService } from "./voiceService";

const encoder = new TextEncoder();

const mockNats = (reply: { data: Uint8Array; contentType?: string } | Error) => {
    const request = vi.fn(async () => {
        if (reply instanceof Error) throw reply;
        return { data: reply.data, headers: { get: () => reply.contentType ?? "" } };
    });
    return { client: { request } as unknown as NatsConnection, request };
};

describe("pipeline voice service", () => {
    it("sends the audio with its media type and language and returns the transcription", async () => {
        const { client, request } = mockNats({ data: encoder.encode(JSON.stringify({ message: " hola " })) });
        const service = createPipelineVoiceService(client, "dev2dtm.Group_g.Topic_t");
        const text = await service.transcribe(new Blob(["abc"], { type: "audio/webm;codecs=opus" }), "es-ES");
        expect(text).toBe("hola");
        const [subject, data, options] = request.mock.calls[0] as unknown as [string, Uint8Array, { headers: { get(k: string): string } }];
        expect(subject).toBe("dev2dtm.Group_g.Topic_t");
        expect(data.length).toBe(3);
        expect(options.headers.get("Content-Type")).toBe("audio/webm");
        expect(options.headers.get("Payload-Language")).toBe("es-ES");
    });

    it("returns the synthesized audio as a blob", async () => {
        const { client, request } = mockNats({ data: new Uint8Array([1, 2, 3]), contentType: "audio/mpeg" });
        const blob = await createPipelineVoiceService(client, "s").synthesize("hola", "es");
        expect(blob.type).toBe("audio/mpeg");
        expect(blob.size).toBe(3);
        const body = JSON.parse(new TextDecoder().decode((request.mock.calls[0] as unknown as [string, Uint8Array])[1]));
        expect(body).toEqual({ ttsText: "hola", voiceLanguage: "es" });
    });

    it("explains a missing voice service in the pipeline", async () => {
        const { client } = mockNats(new Error("503 no responders"));
        await expect(createPipelineVoiceService(client, "s").transcribe(new Blob(["a"]), "es")).rejects.toThrow(
            /no voice service/,
        );
    });
});
