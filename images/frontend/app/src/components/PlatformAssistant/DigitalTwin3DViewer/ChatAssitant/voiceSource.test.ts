import { describe, expect, it } from "vitest";
import { chooseSpeechToText, chooseTextToSpeech, isFirefox } from "./voiceSource";

const both = { browser: true, pipeline: true };

describe("voice source", () => {
    it("recognizes Firefox", () => {
        expect(isFirefox("Mozilla/5.0 (X11; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0")).toBe(true);
        expect(isFirefox("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0 Safari/537.36")).toBe(false);
    });

    it("auto: the browser, except in Firefox when the twin has a voice service", () => {
        expect(chooseSpeechToText("auto", both, false)).toBe("browser");
        expect(chooseSpeechToText("auto", both, true)).toBe("pipeline");
        expect(chooseTextToSpeech("auto", both, false)).toBe("browser");
        expect(chooseTextToSpeech("auto", both, true)).toBe("pipeline");
        expect(chooseSpeechToText("auto", { browser: true, pipeline: false }, true)).toBe("browser");
        expect(chooseSpeechToText("auto", { browser: false, pipeline: true }, false)).toBe("pipeline");
    });

    it("a forced choice that is not available gives way to the other one", () => {
        expect(chooseSpeechToText("pipeline", both, false)).toBe("pipeline");
        expect(chooseSpeechToText("browser", both, true)).toBe("browser");
        expect(chooseSpeechToText("pipeline", { browser: true, pipeline: false }, false)).toBe("browser");
        expect(chooseSpeechToText("browser", { browser: false, pipeline: true }, false)).toBe("pipeline");
        expect(chooseSpeechToText("auto", { browser: false, pipeline: false }, false)).toBeNull();
        expect(chooseTextToSpeech("pipeline", { browser: false, pipeline: false }, false)).toBe("browser");
    });
});
