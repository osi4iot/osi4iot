// Cuándo se da por terminada una pregunta hablada en el modo de voz del chat.
//
// Tras la última palabra se espera una pausa (configurable en el chat). Si la frase parece a medias (acaba en
// "y", "pero", "que", "eh", una coma...) o es muy corta, la pausa se alarga, para no enviar al AI Agent una
// pregunta cortada cuando uno se detiene a pensar. Mientras corre la pausa el chat muestra una cuenta atrás:
// hablar de nuevo la cancela, el micrófono envía ya y la ✕ descarta lo dicho.
//
// En "pulsar para hablar" no hay envío automático: se envía al volver a tocar el micrófono.
import { useCallback, useState } from "react";

export interface VoiceTurnSettings {
    // pausa tras la última palabra antes de enviar (ms)
    pauseMs: number;
    // alargar la pausa si la frase parece a medias
    adaptivePause: boolean;
    // sin envío automático: se toca el micrófono para empezar y otra vez para enviar
    pushToTalk: boolean;
}

export const DEFAULT_VOICE_TURN_SETTINGS: VoiceTurnSettings = { pauseMs: 1500, adaptivePause: true, pushToTalk: false };
export const MIN_PAUSE_MS = 800;
export const MAX_PAUSE_MS = 5000;

// tiempo sin cambios en el texto antes de mostrar la cuenta atrás (evita que parpadee entre palabras)
export const COUNTDOWN_GRACE_MS = 400;

// cuánto se alarga la pausa
const INCOMPLETE_FACTOR = 2;
const SHORT_FACTOR = 1.5;
const SHORT_WORDS = 3;

// palabras con las que una frase casi nunca termina: conjunciones, preposiciones, artículos, muletillas
const TRAILING_WORDS: Record<"es" | "en", string[]> = {
    es: [
        "y", "e", "o", "u", "ni", "pero", "aunque", "que", "porque", "pues", "entonces", "luego", "si", "cuando",
        "como", "donde", "mientras", "de", "del", "a", "al", "en", "con", "sin", "para", "por", "sobre", "entre",
        "hasta", "desde", "hacia", "según", "el", "la", "los", "las", "lo", "un", "una", "unos", "unas", "mi", "tu",
        "su", "sus", "este", "esta", "ese", "esa", "cual", "cuál", "qué", "eh", "em", "ehm", "mmm", "mm", "hmm",
        "bueno", "vale", "sea", "osea", "digamos", "tipo", "más", "muy", "también",
    ],
    en: [
        "and", "or", "but", "nor", "so", "because", "that", "which", "who", "if", "when", "while", "where", "as",
        "than", "then", "of", "to", "in", "on", "at", "for", "with", "without", "from", "by", "about", "into",
        "the", "a", "an", "my", "your", "its", "their", "this", "these", "those", "what", "um", "uh", "uhm", "er",
        "erm", "hmm", "mm", "like", "well", "more", "very", "also",
    ],
};

const languageOf = (lang: string): "es" | "en" => (lang.toLowerCase().startsWith("es") ? "es" : "en");

const wordsOf = (text: string) =>
    text
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter(Boolean);

// ¿parece que la frase sigue? (acaba en coma, guion o puntos suspensivos, o en una de esas palabras)
export const seemsIncomplete = (text: string, lang: string): boolean => {
    const trimmed = text.trim();
    if (trimmed === "") return false;
    if (/[,;:\-–—]$|\.\.\.$|…$/.test(trimmed)) return true;
    if (/[.?!¿¡]$/.test(trimmed)) return false;
    const words = wordsOf(trimmed);
    const last = words[words.length - 1];
    return last !== undefined && TRAILING_WORDS[languageOf(lang)].includes(last);
};

// pausa que hay que esperar tras este texto antes de enviarlo
export const turnPauseMs = (text: string, lang: string, settings: VoiceTurnSettings): number => {
    const base = settings.pauseMs;
    if (!settings.adaptivePause) return base;
    if (seemsIncomplete(text, lang)) return Math.round(base * INCOMPLETE_FACTOR);
    if (wordsOf(text).length < SHORT_WORDS) return Math.round(base * SHORT_FACTOR);
    return base;
};

const STORAGE_KEY = "osi4iot.chatVoiceTurn";

const clampPause = (ms: number) => Math.min(MAX_PAUSE_MS, Math.max(MIN_PAUSE_MS, Math.round(ms / 100) * 100));

const readSettings = (): VoiceTurnSettings => {
    try {
        const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<VoiceTurnSettings> | null;
        if (!stored || typeof stored !== "object") return DEFAULT_VOICE_TURN_SETTINGS;
        return {
            pauseMs: typeof stored.pauseMs === "number" ? clampPause(stored.pauseMs) : DEFAULT_VOICE_TURN_SETTINGS.pauseMs,
            adaptivePause:
                typeof stored.adaptivePause === "boolean" ? stored.adaptivePause : DEFAULT_VOICE_TURN_SETTINGS.adaptivePause,
            pushToTalk: typeof stored.pushToTalk === "boolean" ? stored.pushToTalk : DEFAULT_VOICE_TURN_SETTINGS.pushToTalk,
        };
    } catch {
        return DEFAULT_VOICE_TURN_SETTINGS;
    }
};

// ajustes de voz del chat, guardados en este navegador
export const useVoiceTurnSettings = () => {
    const [settings, setSettings] = useState<VoiceTurnSettings>(readSettings);
    const update = useCallback((changes: Partial<VoiceTurnSettings>) => {
        setSettings((prev) => {
            const next = { ...prev, ...changes };
            next.pauseMs = clampPause(next.pauseMs);
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
            } catch {
                // sin almacenamiento (modo privado...): el ajuste dura hasta cerrar el visor
            }
            return next;
        });
    }, []);
    return [settings, update] as const;
};
