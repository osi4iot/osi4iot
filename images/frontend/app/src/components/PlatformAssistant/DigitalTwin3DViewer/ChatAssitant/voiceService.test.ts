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

describe("built-in voice service of pipelines", () => {
    it("asks pipelines on the user's subject with the Voice-Request header", async () => {
        const request = vi.fn(async () => ({
            data: encoder.encode(JSON.stringify({ message: "你好" })),
            headers: { get: () => "" },
        }));
        const service = createPipelineVoiceService({ request } as unknown as NatsConnection, "dev2dtm.s", "user.sim2state");
        expect(await service.transcribe(new Blob(["a"], { type: "audio/ogg" }), "auto")).toBe("你好");
        const [subject, , options] = request.mock.calls[0] as unknown as [string, Uint8Array, { headers: { get(k: string): string } }];
        expect(subject).toBe("user.sim2state");
        expect(options.headers.get("Voice-Request")).toBe("stt");
        expect(options.headers.get("Payload-Language")).toBe("auto");
    });

    it("falls back to the voice nodes on dev2dtm when pipelines has no voice service", async () => {
        const request = vi
            .fn()
            .mockRejectedValueOnce(new Error("503 no responders"))
            .mockResolvedValue({ data: new Uint8Array([7]), headers: { get: (k: string) => (k === "Content-Type" ? "audio/mpeg" : "") } });
        const service = createPipelineVoiceService({ request } as unknown as NatsConnection, "dev2dtm.s", "user.sim2state");
        const blob = await service.synthesize("你好", "zh-CN", "female");
        expect(blob.type).toBe("audio/mpeg");
        expect(request.mock.calls.map((c) => c[0])).toEqual(["user.sim2state", "dev2dtm.s"]);
        const body = JSON.parse(new TextDecoder().decode(request.mock.calls[1][1] as Uint8Array));
        expect(body).toEqual({ ttsText: "你好", voiceLanguage: "zh-CN", voiceGender: "female" });
        // the next request goes straight to dev2dtm
        await service.synthesize("再见", "zh-CN");
        expect(request.mock.calls[2][0]).toBe("dev2dtm.s");
    });

    it("shows the error of the voice service", async () => {
        const request = vi.fn(async () => ({
            data: encoder.encode(JSON.stringify({ error: "speech to text needs the organization's OpenAI API key" })),
            headers: { get: (k: string) => (k === "Voice-Error" ? "true" : "application/json") },
        }));
        const service = createPipelineVoiceService({ request } as unknown as NatsConnection, "dev2dtm.s", "user.sim2state");
        await expect(service.transcribe(new Blob(["a"]), "es-ES")).rejects.toThrow(/OpenAI API key/);
    });
});
