// Voz del asistente a través del servicio "pipelines" cuando el navegador no la ofrece.
//
//  - Voz a texto: el Web Speech API (SpeechRecognition) solo existe en Chrome, Edge y Safari, y en Chrome
//    depende de un servicio de Google (falla sin conexión con él, en Brave, en Chromium...). Firefox no lo
//    tiene. En esos casos se graba la pregunta (MediaRecorder) y se envía a pipelines, que la transcribe.
//  - Texto a voz: speechSynthesis está en todos los navegadores actuales, pero puede no tener ninguna voz
//    instalada (Firefox en Linux, por ejemplo). Entonces se pide el audio a pipelines.
//
// Las dos cosas son peticiones NATS (request/reply) al servicio de voz de pipelines (en la copia del usuario del
// tópico sim2state, sin nodos en el pipeline: nodes/chatVoice.go) o, con pipelines de versiones anteriores, al
// tópico "dev2dtm" del gemelo digital, donde las atienden los nodos de voz (pipeline de ejemplo: voice_pipeline.yml):
//  - audio (Content-Type audio/...), con la cabecera "Payload-Language"  ->  { "message": "texto" }
//  - JSON { "ttsText": "...", "voiceLanguage": "es" }                    ->  audio (audio/mpeg)
import { type NatsConnection, headers } from "@nats-io/nats-core";
import { StringCodec } from "../../../../tools/natsCodec";

const sc = StringCodec();

export const VOICE_REQUEST_TIMEOUT_MS = 60_000;
// la voz de una respuesta: el nodo Text2Speech se rinde a los 30 s (edge-tts)
export const TTS_REQUEST_TIMEOUT_MS = 35_000;

export interface PipelineVoiceService {
    // language: "es-ES"..., o "auto" (chat bilingüe: el pipeline detecta el idioma)
    transcribe(audio: Blob, language: string): Promise<string>;
    synthesize(text: string, language: string, gender?: "male" | "female"): Promise<Blob>;
}

// "audio/webm;codecs=opus" -> "audio/webm"
const mediaType = (contentType: string) => contentType.split(";")[0].trim().toLowerCase() || "audio/webm";

const isNoResponders = (error: unknown) => /no responders|503/i.test(error instanceof Error ? error.message : String(error));

const describeError = (error: unknown) => {
    const text = error instanceof Error ? error.message : String(error);
    if (isNoResponders(error)) {
        return "the digital twin pipeline has no voice service (is the pipeline running?)";
    }
    if (/timeout/i.test(text)) return "the voice service did not answer in time";
    return text;
};

// cabecera de las peticiones al servicio de voz de pipelines y de su respuesta de error
const VOICE_REQUEST_HEADER = "Voice-Request";
const VOICE_ERROR_HEADER = "Voice-Error";

type NatsReply = Awaited<ReturnType<NatsConnection["request"]>>;

// Servicio de voz: el de pipelines (builtInSubject: la copia del usuario del tópico sim2state, cabecera
// "Voice-Request") y, si no responde (pipelines de versiones anteriores), los nodos de voz del pipeline en
// dev2dtm (subject)
export const createPipelineVoiceService = (
    natsClient: NatsConnection,
    subject: string | null,
    builtInSubject: string | null = null,
): PipelineVoiceService => {
    let builtInMissing = false;
    const request = async (
        kind: "stt" | "tts",
        data: Uint8Array,
        h: ReturnType<typeof headers>,
        timeout: number,
    ): Promise<NatsReply> => {
        if (builtInSubject && !builtInMissing) {
            h.set(VOICE_REQUEST_HEADER, kind);
            try {
                const reply = await natsClient.request(builtInSubject, data, { timeout, headers: h });
                if (reply.headers?.get(VOICE_ERROR_HEADER)) {
                    let text = "the voice service failed";
                    try {
                        const answer = JSON.parse(sc.decode(reply.data)) as { error?: unknown };
                        if (typeof answer.error === "string") text = answer.error;
                    } catch {
                        // sin detalle
                    }
                    throw new Error(text);
                }
                return reply;
            } catch (error) {
                if (!isNoResponders(error) || !subject) throw error;
                builtInMissing = true;
            }
        }
        if (!subject) throw new Error("no responders");
        return natsClient.request(subject, data, { timeout, headers: h });
    };

    return {
        async transcribe(audio, language) {
            const h = headers();
            h.set("Content-Type", mediaType(audio.type));
            h.set("Payload-Language", language);
            h.set("Reply-Timeout-Ms", String(VOICE_REQUEST_TIMEOUT_MS));
            try {
                const data = new Uint8Array(await audio.arrayBuffer());
                const reply = await request("stt", data, h, VOICE_REQUEST_TIMEOUT_MS);
                const answer = JSON.parse(sc.decode(reply.data)) as { message?: unknown };
                return typeof answer.message === "string" ? answer.message.trim() : "";
            } catch (error) {
                throw new Error(`Speech to text failed: ${describeError(error)}`);
            }
        },

        async synthesize(text, language, gender) {
            const h = headers();
            h.set("Content-Type", "application/json");
            h.set("Json-Structure", "object");
            h.set("Reply-Timeout-Ms", String(TTS_REQUEST_TIMEOUT_MS));
            try {
                const body = sc.encode(
                    JSON.stringify({ ttsText: text, voiceLanguage: language, ...(gender ? { voiceGender: gender } : {}) }),
                );
                const reply = await request("tts", body, h, TTS_REQUEST_TIMEOUT_MS);
                const contentType = reply.headers?.get("Content-Type") ?? "";
                if (!contentType.startsWith("audio/")) throw new Error(`unexpected answer (${contentType || "no type"})`);
                return new Blob([reply.data as BlobPart], { type: mediaType(contentType) });
            } catch (error) {
                throw new Error(`Text to speech failed: ${describeError(error)}`);
            }
        },
    };
};

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
