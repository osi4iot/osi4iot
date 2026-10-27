// Voz del asistente a través del servicio "pipelines" cuando el navegador no la ofrece.
//
//  - Voz a texto: el Web Speech API (SpeechRecognition) solo existe en Chrome, Edge y Safari, y en Chrome
//    depende de un servicio de Google (falla sin conexión con él, en Brave, en Chromium...). Firefox no lo
//    tiene. En esos casos se graba la pregunta (MediaRecorder) y se envía a pipelines, que la transcribe.
//  - Texto a voz: speechSynthesis está en todos los navegadores actuales, pero puede no tener ninguna voz
//    instalada (Firefox en Linux, por ejemplo). Entonces se pide el audio a pipelines.
//
// Las dos cosas son peticiones NATS (request/reply) al tópico "dev2dtm" del gemelo digital; el pipeline
// las atiende y responde al remitente (pipeline de ejemplo: voice_pipeline.yml):
//  - audio (Content-Type audio/...), con la cabecera "Payload-Language"  ->  { "message": "texto" }
//  - JSON { "ttsText": "...", "voiceLanguage": "es" }                    ->  audio (audio/mpeg)
import { type NatsConnection, headers } from "@nats-io/nats-core";
import { StringCodec } from "../../../../tools/natsCodec";

const sc = StringCodec();

export const VOICE_REQUEST_TIMEOUT_MS = 60_000;

export interface PipelineVoiceService {
    transcribe(audio: Blob, language: string): Promise<string>;
    synthesize(text: string, language: string): Promise<Blob>;
}

// "audio/webm;codecs=opus" -> "audio/webm"
const mediaType = (contentType: string) => contentType.split(";")[0].trim().toLowerCase() || "audio/webm";

const describeError = (error: unknown) => {
    const text = error instanceof Error ? error.message : String(error);
    if (/no responders|503/i.test(text)) {
        return "the digital twin pipeline has no voice service (see the voice nodes listening on dev2dtm)";
    }
    if (/timeout/i.test(text)) return "the voice service did not answer in time";
    return text;
};

export const createPipelineVoiceService = (natsClient: NatsConnection, subject: string): PipelineVoiceService => ({
    async transcribe(audio, language) {
        const h = headers();
        h.set("Content-Type", mediaType(audio.type));
        h.set("Payload-Language", language);
        h.set("Reply-Timeout-Ms", String(VOICE_REQUEST_TIMEOUT_MS));
        try {
            const data = new Uint8Array(await audio.arrayBuffer());
            const reply = await natsClient.request(subject, data, { timeout: VOICE_REQUEST_TIMEOUT_MS, headers: h });
            const answer = JSON.parse(sc.decode(reply.data)) as { message?: unknown };
            return typeof answer.message === "string" ? answer.message.trim() : "";
        } catch (error) {
            throw new Error(`Speech to text failed: ${describeError(error)}`);
        }
    },

    async synthesize(text, language) {
        const h = headers();
        h.set("Content-Type", "application/json");
        h.set("Json-Structure", "object");
        h.set("Reply-Timeout-Ms", String(VOICE_REQUEST_TIMEOUT_MS));
        try {
            const body = sc.encode(JSON.stringify({ ttsText: text, voiceLanguage: language }));
            const reply = await natsClient.request(subject, body, { timeout: VOICE_REQUEST_TIMEOUT_MS, headers: h });
            const contentType = reply.headers?.get("Content-Type") ?? "";
            if (!contentType.startsWith("audio/")) throw new Error(`unexpected answer (${contentType || "no type"})`);
            return new Blob([reply.data as BlobPart], { type: mediaType(contentType) });
        } catch (error) {
            throw new Error(`Text to speech failed: ${describeError(error)}`);
        }
    },
});

// ¿Tiene el navegador alguna voz para speechSynthesis? (getVoices puede tardar en llenarse)
export const hasSpeechSynthesisVoices = () =>
    typeof window !== "undefined" && "speechSynthesis" in window && window.speechSynthesis.getVoices().length > 0;

// Reproduce un audio y resuelve al terminar (o al fallar)
export const playAudioBlob = (blob: Blob, onStart?: (audio: HTMLAudioElement) => void) =>
    new Promise<void>((resolve) => {
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        const done = () => {
            URL.revokeObjectURL(url);
            resolve();
        };
        audio.onended = done;
        audio.onerror = done;
        audio.onpause = () => {
            if (!audio.ended) done();
        };
        onStart?.(audio);
        audio.play().catch(done);
    });
