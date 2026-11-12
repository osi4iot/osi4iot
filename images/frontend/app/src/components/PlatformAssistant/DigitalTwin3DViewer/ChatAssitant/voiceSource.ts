// Quién hace cada dirección del modo voz del chat: el navegador o el pipeline del gemelo (voiceService.ts).
//
//  - Voz a texto (lo que dice el usuario): el Web Speech API del navegador o la grabación transcrita en el pipeline.
//  - Texto a voz (las respuestas leídas): speechSynthesis del navegador o el audio que genera el pipeline.
//
// Cada una se elige en los ajustes del modo voz: "auto", "browser" o "pipeline". En "auto" se usa el navegador,
// salvo en Firefox: su reconocimiento local exige hablar muy despacio y sus voces (eSpeak en Linux) suenan
// robóticas, así que si el gemelo tiene servicio de voz se usa el pipeline para las dos. Lo elegido que no está
// disponible deja paso a lo otro.

export type VoiceSource = "auto" | "browser" | "pipeline";
export type VoiceEngine = "browser" | "pipeline";

export const VOICE_SOURCES: VoiceSource[] = ["auto", "browser", "pipeline"];

export const isVoiceSource = (value: unknown): value is VoiceSource =>
    typeof value === "string" && (VOICE_SOURCES as string[]).includes(value);

export const isFirefox = (userAgent: string = typeof navigator !== "undefined" ? navigator.userAgent : "") =>
    /\bfirefox\//i.test(userAgent);

const choose = (setting: VoiceSource, browser: boolean, pipeline: boolean, firefox: boolean): VoiceEngine | null => {
    const preferred: VoiceEngine =
        setting === "pipeline" || (setting === "auto" && firefox && pipeline) ? "pipeline" : "browser";
    if (preferred === "pipeline") return pipeline ? "pipeline" : browser ? "browser" : null;
    return browser ? "browser" : pipeline ? "pipeline" : null;
};

// voz a texto: `browser` = el navegador tiene reconocimiento de voz y no ha fallado; `pipeline` = el gemelo
// tiene servicio de voz y el navegador puede grabar. null: no hay voz a texto
export const chooseSpeechToText = (
    setting: VoiceSource,
    available: { browser: boolean; pipeline: boolean },
    firefox = isFirefox(),
): VoiceEngine | null => choose(setting, available.browser, available.pipeline, firefox);

// texto a voz: `browser` = el navegador tiene alguna voz; `pipeline` = el gemelo tiene servicio de voz. Sin
// ninguna de las dos se usa el navegador (no lee nada, pero el chat sigue funcionando)
export const chooseTextToSpeech = (
    setting: VoiceSource,
    available: { browser: boolean; pipeline: boolean },
    firefox = isFirefox(),
): VoiceEngine => choose(setting, available.browser, available.pipeline, firefox) ?? "browser";

export const VOICE_ENGINE_LABEL: Record<VoiceEngine, string> = { browser: "Browser", pipeline: "Pipeline" };

export const VOICE_SOURCE_LABEL: Record<VoiceSource, string> = {
    auto: "Auto",
    browser: "Browser",
    pipeline: "Digital twin pipeline",
};
