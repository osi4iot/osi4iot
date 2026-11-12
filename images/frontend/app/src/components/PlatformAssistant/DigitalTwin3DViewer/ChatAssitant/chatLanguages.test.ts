import { describe, expect, it } from "vitest";
import {
    answerVoiceLanguage,
    chatLanguageOf,
    chatVoiceGender,
    isBilingualChat,
    messageInLanguage,
    sanitizeTranslation,
} from "./chatLanguages";

describe("chat languages", () => {
    it("knows the old and the new codes", () => {
        expect(chatLanguageOf("en-UK-male")?.code).toBe("en-GB");
        expect(chatLanguageOf("ca")?.code).toBe("ca-ES");
        expect(chatLanguageOf("zh-CN")?.native).toBe("中文");
        expect(chatLanguageOf("none")).toBeNull();
        expect(chatVoiceGender("en-UK-male")).toBe("male");
        expect(chatVoiceGender("en-UK-female")).toBe("female");
    });

    it("is bilingual with two different languages", () => {
        expect(isBilingualChat("es-ES", "zh-CN")).toBe(true);
        expect(isBilingualChat("es-ES", "none")).toBe(false);
        expect(isBilingualChat("en-UK-male", "en-GB")).toBe(false);
        expect(isBilingualChat("none", "zh-CN")).toBe(false);
    });

    it("reads the answer in the language of the question, or the one chosen", () => {
        expect(answerVoiceLanguage("question", "es-ES", "zh-CN", "zh-CN")).toBe("zh-CN");
        expect(answerVoiceLanguage("question", "es-ES", "zh-CN", "es-ES")).toBe("es-ES");
        expect(answerVoiceLanguage("question", "es-ES", "zh-CN", undefined)).toBe("es-ES");
        expect(answerVoiceLanguage("secondary", "es-ES", "zh-CN", "es-ES")).toBe("zh-CN");
        const translation = { language: "es-ES", translatedLanguage: "zh-CN", message: "风速为 12 m/s" };
        expect(messageInLanguage("La velocidad es 12 m/s", translation, "zh-CN").text).toBe("风速为 12 m/s");
        expect(messageInLanguage("La velocidad es 12 m/s", translation, "es-ES").text).toBe("La velocidad es 12 m/s");
    });

    it("keeps only valid translations", () => {
        expect(sanitizeTranslation({ language: "es-ES", translatedLanguage: "zh-CN", message: "你好" })?.message).toBe("你好");
        expect(sanitizeTranslation({ message: "" })).toBeUndefined();
        expect(sanitizeTranslation("x")).toBeUndefined();
    });
});

import { plainSpeechText } from "./ChatAssistant";

describe("speech text of the languages without normalizer", () => {
    it("does not read formulas, as in one language", () => {
        expect(plainSpeechText("一个对称矩阵：\n$$\n\\begin{pmatrix} 10 & 1 \\\\ 1 & 12 \\end{pmatrix}\n$$")).toBe("");
        expect(plainSpeechText("矩阵 \\begin{bmatrix} 1 & 0 \\end{bmatrix}")).toBe("");
        expect(plainSpeechText("风速为 **12.5 m/s**，其中 $v = \\omega r$。")).toBe("风速为 12.5 m/s，其中 。");
    });
});
