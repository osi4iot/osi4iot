import { describe, expect, it } from "vitest";
import { DEFAULT_VOICE_TURN_SETTINGS, seemsIncomplete, turnPauseMs } from "./voiceTurn";

describe("voice turn", () => {
    it("detects sentences that seem unfinished", () => {
        expect(seemsIncomplete("muéstrame los desplazamientos y", "es-ES")).toBe(true);
        expect(seemsIncomplete("cuál es la tensión máxima en el", "es-ES")).toBe(true);
        expect(seemsIncomplete("dame el valor eh", "es-ES")).toBe(true);
        expect(seemsIncomplete("muestra el nodo 100,", "es-ES")).toBe(true);
        expect(seemsIncomplete("muestra el nodo 100", "es-ES")).toBe(false);
        expect(seemsIncomplete("¿cuál es la carga máxima?", "es-ES")).toBe(false);
        expect(seemsIncomplete("show me the displacements and", "en-US")).toBe(true);
        expect(seemsIncomplete("show me the displacements", "en-US")).toBe(false);
    });

    it("waits longer for unfinished or very short sentences", () => {
        const settings = { ...DEFAULT_VOICE_TURN_SETTINGS, pauseMs: 1500 };
        expect(turnPauseMs("muestra el nodo 100", "es-ES", settings)).toBe(1500);
        expect(turnPauseMs("muestra el nodo 100 y", "es-ES", settings)).toBe(3000);
        expect(turnPauseMs("hola", "es-ES", settings)).toBe(2250);
        expect(turnPauseMs("muestra el nodo 100 y", "es-ES", { ...settings, adaptivePause: false })).toBe(1500);
    });
});
