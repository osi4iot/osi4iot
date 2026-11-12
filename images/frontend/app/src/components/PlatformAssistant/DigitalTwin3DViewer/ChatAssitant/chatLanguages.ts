// Los idiomas del chat del asistente: el principal del gemelo (chatAssistantLanguage) y, en el chat bilingüe, el
// segundo (chatAssistantSecondLanguage). Cada uno con su código de reconocimiento de voz y de voz del navegador,
// su nombre en el propio idioma (el que se ve en el chat) y el saludo inicial.
//
// El chat bilingüe: cada pregunta y cada respuesta se muestra también en el otro idioma (la traduce el pipeline,
// nodes/chatTranslation.go), y la respuesta se lee en el idioma configurado (chatAssistantVoiceLanguage).

export interface ChatLanguage {
    // código guardado en el gemelo ("es-ES", "zh-CN"...)
    code: string;
    // en los formularios
    label: string;
    // en el chat (su propio nombre)
    native: string;
    // reconocimiento de voz del navegador y voz del navegador
    recognition: string;
    greeting: string;
}

export const CHAT_LANGUAGES: ChatLanguage[] = [
    { code: "en-GB", label: "English", native: "English", recognition: "en-GB", greeting: "Hello! I'm OSI. How can I help you?" },
    { code: "es-ES", label: "Spanish", native: "Español", recognition: "es-ES", greeting: "¡Hola! Soy OSI. ¿En qué puedo ayudarte?" },
    { code: "fr-FR", label: "French", native: "Français", recognition: "fr-FR", greeting: "Bonjour ! Je suis OSI. Comment puis-je vous aider ?" },
    { code: "it-IT", label: "Italian", native: "Italiano", recognition: "it-IT", greeting: "Ciao! Sono OSI. Come posso aiutarti?" },
    { code: "de-DE", label: "German", native: "Deutsch", recognition: "de-DE", greeting: "Hallo! Ich bin OSI. Wie kann ich Ihnen helfen?" },
    { code: "ca-ES", label: "Catalan", native: "Català", recognition: "ca-ES", greeting: "Hola! Sóc l'OSI. Com et puc ajudar?" },
    { code: "pt-PT", label: "Portuguese (Portugal)", native: "Português", recognition: "pt-PT", greeting: "Olá! Sou o OSI. Como posso ajudar?" },
    { code: "pt-BR", label: "Portuguese (Brazil)", native: "Português (Brasil)", recognition: "pt-BR", greeting: "Olá! Eu sou o OSI. Como posso ajudar?" },
    { code: "zh-CN", label: "Chinese (Mandarin, simplified)", native: "中文", recognition: "zh-CN", greeting: "你好！我是 OSI。有什么可以帮您？" },
    { code: "ja-JP", label: "Japanese", native: "日本語", recognition: "ja-JP", greeting: "こんにちは！OSIです。何かお手伝いできることはありますか？" },
    { code: "ko-KR", label: "Korean", native: "한국어", recognition: "ko-KR", greeting: "안녕하세요! OSI입니다. 무엇을 도와드릴까요?" },
    { code: "ru-RU", label: "Russian", native: "Русский", recognition: "ru-RU", greeting: "Здравствуйте! Я OSI. Чем могу помочь?" },
    { code: "ar-SA", label: "Arabic", native: "العربية", recognition: "ar-SA", greeting: "مرحبًا! أنا OSI. كيف يمكنني مساعدتك؟" },
    { code: "nl-NL", label: "Dutch", native: "Nederlands", recognition: "nl-NL", greeting: "Hallo! Ik ben OSI. Waarmee kan ik helpen?" },
    { code: "pl-PL", label: "Polish", native: "Polski", recognition: "pl-PL", greeting: "Cześć! Jestem OSI. W czym mogę pomóc?" },
    { code: "tr-TR", label: "Turkish", native: "Türkçe", recognition: "tr-TR", greeting: "Merhaba! Ben OSI. Size nasıl yardımcı olabilirim?" },
    { code: "hi-IN", label: "Hindi", native: "हिन्दी", recognition: "hi-IN", greeting: "नमस्ते! मैं OSI हूँ। मैं आपकी कैसे मदद कर सकता हूँ?" },
    { code: "sv-SE", label: "Swedish", native: "Svenska", recognition: "sv-SE", greeting: "Hej! Jag är OSI. Hur kan jag hjälpa dig?" },
];

// "es-ES" -> "es", "en-UK-male" -> "en", "none" -> ""
export const chatLanguageBase = (code: string | undefined | null): string => {
    const c = (code ?? "").trim().toLowerCase();
    if (!c || c === "none") return "";
    return c.split(/[-_]/)[0];
};

// el idioma de un código del gemelo (también los antiguos: "en-UK-male", "ca"); null para "none"
export const chatLanguageOf = (code: string | undefined | null): ChatLanguage | null => {
    const c = (code ?? "").trim();
    if (!c || c === "none") return null;
    if (/^en-UK-(male|female)$/i.test(c)) return CHAT_LANGUAGES[0];
    const exact = CHAT_LANGUAGES.find((l) => l.code.toLowerCase() === c.toLowerCase());
    if (exact) return exact;
    const base = chatLanguageBase(c);
    return CHAT_LANGUAGES.find((l) => chatLanguageBase(l.code) === base) ?? null;
};

// la voz del pipeline: hombre o mujer (solo el inglés del idioma principal lo dice: "en-UK-male")
export const chatVoiceGender = (primaryCode: string | undefined | null): "male" | "female" =>
    /-male$/i.test(primaryCode ?? "") ? "male" : "female";

// ¿Es bilingüe el chat? Dos idiomas distintos
export const isBilingualChat = (primary: string | undefined | null, secondary: string | undefined | null): boolean => {
    const a = chatLanguageBase(primary);
    const b = chatLanguageBase(secondary);
    return a !== "" && b !== "" && a !== b;
};

export const sameChatLanguage = (a: string | undefined | null, b: string | undefined | null): boolean =>
    chatLanguageBase(a) !== "" && chatLanguageBase(a) === chatLanguageBase(b);

export const chatLanguageNative = (code: string | undefined | null): string => chatLanguageOf(code)?.native ?? (code ?? "");

// en qué idioma se leen las respuestas del chat bilingüe
export type ChatVoiceLanguage = "question" | "primary" | "secondary";

export const CHAT_VOICE_LANGUAGE_OPTIONS: { label: string; value: ChatVoiceLanguage }[] = [
    { label: "The language of the question", value: "question" },
    { label: "The main language", value: "primary" },
    { label: "The second language", value: "secondary" },
];

export const chatVoiceLanguageOf = (value: unknown): ChatVoiceLanguage =>
    value === "primary" || value === "secondary" ? value : "question";

// Opciones de los formularios del gemelo: el idioma principal (con los valores de siempre, el inglés con voz de
// hombre o de mujer) y el segundo idioma
export const CHAT_PRIMARY_LANGUAGE_OPTIONS: { label: string; value: string }[] = [
    { label: "None", value: "none" },
    { label: "UK English Male", value: "en-UK-male" },
    { label: "UK English Female", value: "en-UK-female" },
    { label: "Spanish", value: "es-ES" },
    { label: "French", value: "fr-FR" },
    { label: "Italian", value: "it-IT" },
    { label: "German", value: "de-DE" },
    { label: "Catalan", value: "ca" },
    ...CHAT_LANGUAGES.filter((l) => !["en-GB", "es-ES", "fr-FR", "it-IT", "de-DE", "ca-ES"].includes(l.code)).map((l) => ({
        label: l.label,
        value: l.code,
    })),
];

export const CHAT_SECOND_LANGUAGE_OPTIONS: { label: string; value: string }[] = [
    { label: "None (one language)", value: "none" },
    ...CHAT_LANGUAGES.map((l) => ({ label: `${l.label} · ${l.native}`, value: l.code })),
];

// Un mensaje del chat bilingüe en el otro idioma (como lo envía el pipeline)
export interface MessageTranslation {
    // idioma en que se escribió el mensaje y el de la traducción
    language: string;
    translatedLanguage: string;
    message: string;
}

export const sanitizeTranslation = (value: unknown): MessageTranslation | undefined => {
    if (!value || typeof value !== "object") return undefined;
    const t = value as Record<string, unknown>;
    if (typeof t.message !== "string" || t.message.trim() === "") return undefined;
    return {
        language: typeof t.language === "string" ? t.language : "",
        translatedLanguage: typeof t.translatedLanguage === "string" ? t.translatedLanguage : "",
        message: t.message,
    };
};

// El texto de un mensaje en un idioma: el original o su traducción (si ninguno está en ese idioma, el original)
export const messageInLanguage = (
    message: string,
    translation: MessageTranslation | undefined,
    language: string,
): { text: string; language: string } => {
    if (translation && sameChatLanguage(translation.translatedLanguage, language)) {
        return { text: translation.message, language: translation.translatedLanguage };
    }
    return { text: message, language: translation?.language || language };
};

// En qué idioma se lee una respuesta: el configurado, o el de la pregunta (el idioma en que se escribió)
export const answerVoiceLanguage = (
    setting: ChatVoiceLanguage,
    primary: string,
    secondary: string,
    questionLanguage: string | undefined,
): string => {
    if (setting === "primary") return primary;
    if (setting === "secondary") return secondary;
    if (questionLanguage && (sameChatLanguage(questionLanguage, primary) || sameChatLanguage(questionLanguage, secondary))) {
        return sameChatLanguage(questionLanguage, primary) ? primary : secondary;
    }
    return primary;
};
