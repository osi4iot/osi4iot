import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_VIEWER_OPTIONS } from "../Utils/constants";
import { ViewerOptions } from "../Types/types";
import AssistantPanel from "./AssistantPanel";
import DigitalTwinSimulatorModal from "../ViewerTools/DigitalTwinSimulatorModal";
import { withOptionAt } from "./optionsUpdate";
import { LightingOptions, lightingOf, presetOptions } from "../Utils/lighting";
import { subscribeCameraCommands } from "../Utils/cameraControl";

const baseOpts = (): ViewerOptions =>
    ({
        ...DEFAULT_VIEWER_OPTIONS,
        femResultDate: "2026-10-26",
        sensorsVisibilityState: {
            Accelerometers: { hide: false, highlight: false, showSensorMarker: false, opacity: 1 },
            Strain: { hide: false, highlight: false, showSensorMarker: false, opacity: 1 },
        },
        assetsVisibilityState: {},
        animatedObjectsVisibilityState: {},
        genericObjectsVisibilityState: { General: { hide: false, highlight: false, opacity: 1, showDeepObjects: false } },
        femSimulationObjectsVisibilityState: {},
        digitalTwinSimulatorState: { temperature: 20 },
    }) as unknown as ViewerOptions;

let latest: ViewerOptions;

const Harness = ({
    simulator = {} as Record<string, any>,
    twinLighting,
    onSaveLighting,
}: {
    simulator?: Record<string, any>;
    twinLighting?: LightingOptions;
    onSaveLighting?: () => void;
}) => {
    const [opts, setOpts] = useState<ViewerOptions>(baseOpts);
    latest = opts;
    return (
        <AssistantPanel
            opts={opts}
            setOpts={(updater) => setOpts(updater)}
            sensorObjects={[{ collectionName: "Accelerometers" }, { collectionName: "Accelerometers" }, { collectionName: "Strain" }]}
            sensorCollectionNames={["Accelerometers", "Strain"]}
            assetObjects={[]}
            assetCollectionNames={[]}
            genericObjects={[{ collectionName: "General" }]}
            genericObjectCollectionNames={["General"]}
            femSimulationObjects={[]}
            femSimObjectCollectionNames={[]}
            femResultDates={[]}
            femResultNames={[]}
            digitalTwinSimulationFormat={simulator}
            getLastMeasurementsButtomLabel="GET LAST MEASUREMENTS"
            lockReadingButtomLabel="LOCK READ MEASUREMENTS"
            handleGetLastMeasurementsButton={() => {}}
            handleLockReadMeasurementsButtonClick={() => {}}
            twinLighting={twinLighting}
            onSaveLighting={onSaveLighting}
        />
    );
};

describe("DigitalTwinSimulatorModal", () => {
    const format = {
        temp: { label: "Temperature", units: "ºC", minValue: 0, maxValue: 50, defaultValue: 20, step: 0.5, topicId: 1 },
    } as any;

    it("parte de los valores por defecto, los botones − / + avanzan un paso y Stop deja de simular", () => {
        const updates: Record<string, number>[] = [];
        const dock = vi.fn();
        const stop = vi.fn();
        render(
            <DigitalTwinSimulatorModal
                digitalTwinSimulatorFormat={format}
                updateDigitalTwinSimulatorState={(state) => updates.push(state)}
                onDock={dock}
                onStop={stop}
            />,
        );
        expect(updates.at(-1)).toEqual({ temp: 20 });
        fireEvent.click(screen.getByRole("button", { name: "Increase Temperature" }));
        expect(updates.at(-1)).toEqual({ temp: 20.5 });
        fireEvent.click(screen.getByRole("button", { name: "Stop simulation" }));
        expect(stop).toHaveBeenCalledTimes(1);
        expect(dock).not.toHaveBeenCalled();
    });

    it("muestra los valores que se están simulando y al cerrarla vuelve al panel del asistente sin parar", () => {
        const updates: Record<string, number>[] = [];
        const dock = vi.fn();
        const stop = vi.fn();
        render(
            <DigitalTwinSimulatorModal
                digitalTwinSimulatorFormat={format}
                values={{ temp: 31 }}
                updateDigitalTwinSimulatorState={(state) => updates.push(state)}
                onDock={dock}
                onStop={stop}
            />,
        );
        expect(updates.at(-1)).toEqual({ temp: 31 });
        fireEvent.click(screen.getByRole("button", { name: "Increase Temperature" }));
        expect(updates.at(-1)).toEqual({ temp: 31.5 });
        fireEvent.click(screen.getByRole("button", { name: "Back to the assistant panel" }));
        expect(dock).toHaveBeenCalledTimes(1);
        expect(stop).not.toHaveBeenCalled();
    });
});

describe("AssistantPanel con el chat", () => {
    const chatProps = (overrides: Record<string, unknown> = {}) => ({
        opts: baseOpts(),
        setOpts: () => {},
        sensorObjects: [{ collectionName: "Accelerometers" }],
        sensorCollectionNames: ["Accelerometers"],
        assetObjects: [],
        assetCollectionNames: [],
        genericObjects: [],
        genericObjectCollectionNames: [],
        femSimulationObjects: [],
        femSimObjectCollectionNames: [],
        femResultDates: [],
        femResultNames: [],
        digitalTwinSimulationFormat: { temperature: { label: "Temperature", minValue: 0, maxValue: 50, step: 1 } },
        getLastMeasurementsButtomLabel: "GET LAST MEASUREMENTS",
        lockReadingButtomLabel: "LOCK READ MEASUREMENTS",
        handleGetLastMeasurementsButton: () => {},
        handleLockReadMeasurementsButtonClick: () => {},
        chatContent: <div>chat body</div>,
        ...overrides,
    });

    it("el chat es la primera pestaña y se elige desde el visor", () => {
        const onChatActiveChange = vi.fn();
        const { rerender } = render(<AssistantPanel {...(chatProps({ onChatActiveChange }) as any)} />);
        const tabs = screen.getAllByRole("tab");
        expect(tabs[0]).toHaveAttribute("aria-label", "Chat with assistant");
        expect(screen.getByText("chat body")).not.toBeVisible();
        fireEvent.click(tabs[0]);
        expect(onChatActiveChange).toHaveBeenCalledWith(true);
        rerender(<AssistantPanel {...(chatProps({ onChatActiveChange, chatActive: true }) as any)} />);
        expect(screen.getByText("chat body")).toBeVisible();
        fireEvent.click(screen.getByRole("tab", { name: "Sensors" }));
        expect(onChatActiveChange).toHaveBeenLastCalledWith(false);
    });

    it("solo el chat en las vistas sin modelo 3D y punto de mensajes sin leer", () => {
        render(<AssistantPanel {...(chatProps({ chatOnly: true }) as any)} />);
        expect(screen.getAllByRole("tab")).toHaveLength(1);
        expect(screen.getByText("chat body")).toBeVisible();
    });

    it("avisa de una respuesta sin leer en la pestaña del chat", () => {
        render(<AssistantPanel {...(chatProps({ chatUnread: true }) as any)} />);
        expect(screen.getByLabelText("New answer from the assistant")).toBeInTheDocument();
    });

    it("el simulador se saca a una ventana flotante y se vuelve a traer", () => {
        const onFloat = vi.fn();
        const onDock = vi.fn();
        const { rerender } = render(
            <AssistantPanel {...(chatProps({ onFloatSimulator: onFloat, onDockSimulator: onDock }) as any)} />,
        );
        fireEvent.click(screen.getByRole("tab", { name: "Digital twin simulator" }));
        fireEvent.click(screen.getByRole("button", { name: "Open the simulator in a floating window" }));
        expect(onFloat).toHaveBeenCalledTimes(1);
        rerender(
            <AssistantPanel
                {...(chatProps({ onFloatSimulator: onFloat, onDockSimulator: onDock, simulatorFloating: true }) as any)}
            />,
        );
        expect(screen.queryByRole("button", { name: "Open the simulator in a floating window" })).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "Bring it back here" }));
        expect(onDock).toHaveBeenCalledTimes(1);
    });
});

describe("withOptionAt", () => {
    it("copia en profundidad y crea los objetos intermedios", () => {
        const source = { a: { b: 1 }, list: [{ x: 1 }] } as any;
        const result = withOptionAt(source, ["c", "d"], 5) as any;
        expect(result.c.d).toBe(5);
        expect(result.a).not.toBe(source.a);
        expect(result.list[0]).not.toBe(source.list[0]);
        expect(source.c).toBeUndefined();
    });
});

describe("AssistantPanel", () => {
    it("muestra solo las pestañas con contenido", () => {
        render(<Harness />);
        const tabs = screen.getAllByRole("tab").map((t) => t.textContent);
        expect(tabs).toEqual(["Scene", "Sensors", "Generic", "System"]);
        expect(screen.getByRole("tab", { name: "Generic objects" })).toBeInTheDocument();
    });

    it("el interruptor de la luz ambiente cambia ambientLight (antes escribía 'ambientLigth')", () => {
        render(<Harness />);
        const sw = screen.getByRole("switch", { name: "Ambient light" });
        // el preset por defecto (Studio) no usa luz ambiente
        expect(sw).toHaveAttribute("aria-checked", "false");
        fireEvent.click(sw);
        expect(latest.ambientLight).toBe(true);
        expect((latest as any).ambientLigth).toBeUndefined();
    });

    it("el valor del deslizador se puede escribir y se ajusta al rango y al paso", () => {
        render(<Harness />);
        const ambientHeader = screen.getByRole("button", { name: "Ambient light" });
        if (ambientHeader.getAttribute("aria-expanded") !== "true") fireEvent.click(ambientHeader);
        fireEvent.click(screen.getByRole("switch", { name: "Ambient light" }));
        fireEvent.click(screen.getByRole("button", { name: /^Intensity: 1.00/ }));
        const input = screen.getByRole("textbox", { name: "Intensity value" });
        fireEvent.change(input, { target: { value: "3,333" } });
        fireEvent.keyDown(input, { key: "Enter" });
        expect(latest.ambientLightIntensity).toBe(3.35);
        fireEvent.click(screen.getByRole("button", { name: /Intensity: 3.35/ }));
        const again = screen.getByRole("textbox", { name: "Intensity value" });
        fireEvent.change(again, { target: { value: "99" } });
        fireEvent.keyDown(again, { key: "Enter" });
        expect(latest.ambientLightIntensity).toBe(10);
    });

    it("iluminación: un preset aplica sus opciones y cambiar algo a mano lo deja en Custom", () => {
        render(<Harness />);
        const preset = screen.getByRole("combobox", { name: "Preset" }) as HTMLSelectElement;
        expect(preset.value).toBe("studio");
        expect(within(preset).getByRole("option", { name: "Studio" })).toBeInTheDocument();
        fireEvent.change(preset, { target: { value: "industrial" } });
        expect(latest.lightingPreset).toBe("industrial");
        expect(latest.environment).toBe("warehouse");
        expect(latest.ambientOcclusion).toBe(true);
        fireEvent.change(preset, { target: { value: "classic" } });
        expect(latest.environment).toBe("sunset");
        expect(latest.toneMapping).toBe("aces");
        expect(latest.exposure).toBe(1.5);
        expect(latest.ambientLight && latest.spotLight && latest.pointLight).toBe(true);
        // un cambio a mano
        fireEvent.change(screen.getByRole("combobox", { name: "Tone mapping" }), { target: { value: "agx" } });
        expect(latest.toneMapping).toBe("agx");
        expect(latest.lightingPreset).toBe("custom");
        // los ajustes que no son de iluminación no tocan el preset
        fireEvent.change(preset, { target: { value: "studio" } });
        const viewHeader = screen.getByRole("button", { name: "View" });
        if (viewHeader.getAttribute("aria-expanded") !== "true") fireEvent.click(viewHeader);
        fireEvent.click(screen.getByRole("switch", { name: "Axes" }));
        expect(latest.showAxes).toBe(true);
        expect(latest.lightingPreset).toBe("studio");
    });

    it("iluminación: el entorno como fondo con cualquier entorno salvo None, y las etiquetas legibles", () => {
        render(<Harness />);
        const env = screen.getByRole("combobox", { name: "Environment" }) as HTMLSelectElement;
        expect(within(env).getByRole("option", { name: "Industrial warehouse" })).toBeInTheDocument();
        const switchOf = () => screen.getByRole("switch", { name: "Environment as background" });
        const blur = () => screen.getByRole("button", { name: /^Background blur/ });
        // neutral (el entorno por defecto, generado) también puede ser el fondo
        expect(switchOf()).not.toBeDisabled();
        expect(blur()).toBeDisabled(); // el desenfoque, solo con el fondo activado
        fireEvent.click(switchOf());
        expect(latest.environmentBackground).toBe(true);
        expect(blur()).not.toBeDisabled();
        fireEvent.change(env, { target: { value: "outdoor" } });
        expect(switchOf()).not.toBeDisabled();
        // sin entorno no hay nada que mostrar
        fireEvent.change(env, { target: { value: "none" } });
        expect(switchOf()).toBeDisabled();
    });

    it("iluminación del gemelo: Reset vuelve a la suya y Save for twin la guarda", () => {
        const twin = lightingOf(presetOptions("industrial"));
        const save = vi.fn();
        render(<Harness twinLighting={twin} onSaveLighting={save} />);
        fireEvent.change(screen.getByRole("combobox", { name: "Environment" }), { target: { value: "night" } });
        expect(latest.environment).toBe("night");
        fireEvent.click(screen.getByRole("button", { name: /Reset/ }));
        expect(latest.environment).toBe("warehouse");
        expect(latest.lightingPreset).toBe("industrial");
        fireEvent.click(screen.getByRole("button", { name: /Save for twin/ }));
        expect(save).toHaveBeenCalledTimes(1);
    });

    it("cámara: proyección, campo de visión y vistas rápidas", () => {
        render(<Harness />);
        const viewHeader = screen.getByRole("button", { name: "View" });
        if (viewHeader.getAttribute("aria-expanded") !== "true") fireEvent.click(viewHeader);
        expect(screen.getByRole("button", { name: /^Field of view/ })).toBeDisabled();
        fireEvent.change(screen.getByRole("combobox", { name: "Camera" }), { target: { value: "perspective" } });
        expect(latest.cameraProjection).toBe("perspective");
        expect(latest.lightingPreset).toBe("studio"); // la cámara no es iluminación
        expect(screen.getByRole("button", { name: /^Field of view/ })).not.toBeDisabled();
        const received: unknown[] = [];
        const off = subscribeCameraCommands((c) => received.push(c));
        fireEvent.click(within(screen.getByRole("group", { name: "Camera views" })).getByRole("button", { name: "Top" }));
        off();
        expect(received).toEqual([{ view: "top" }]);
    });

    it("sin permiso para guardar no aparece Save for twin", () => {
        render(<Harness />);
        expect(screen.queryByRole("button", { name: /Save for twin/ })).toBeNull();
        expect(screen.getByRole("button", { name: /Reset/ })).toBeInTheDocument();
    });

    it("colecciones: 'All collections' usa las opciones globales y cada colección las suyas", () => {
        render(<Harness />);
        fireEvent.click(screen.getByRole("tab", { name: /Sensors/ }));
        fireEvent.click(screen.getByRole("button", { name: "Highlight All collections" }));
        expect(latest.highlightAllSensors).toBe(true);
        fireEvent.click(screen.getByRole("button", { name: "Hide Strain" }));
        expect(latest.sensorsVisibilityState.Strain.hide).toBe(true);
        expect(latest.sensorsVisibilityState.Accelerometers.hide).toBe(false);
        fireEvent.click(screen.getByRole("button", { name: "Sensor marker Accelerometers" }));
        expect(latest.sensorsVisibilityState.Accelerometers.showSensorMarker).toBe(true);
        // recuento de objetos por colección
        const row = screen.getByRole("button", { name: /^Accelerometers/ });
        expect(within(row).getByText("2")).toBeInTheDocument();
    });

    it("una sola colección se muestra con su nombre y usa las opciones globales", () => {
        render(<Harness />);
        fireEvent.click(screen.getByRole("tab", { name: "Generic objects" }));
        expect(screen.queryByText("All collections")).toBeNull();
        fireEvent.click(screen.getByRole("switch", { name: "Show deep objects" }));
        expect(latest.genericObjectsShowDeepObjects).toBe(true);
    });

    it("pestaña Simulator con los parámetros del gemelo digital", () => {
        render(<Harness simulator={{ temperature: { label: "Temperature", units: "ºC", minValue: 0, maxValue: 100, step: 1 } }} />);
        fireEvent.click(screen.getByRole("tab", { name: "Digital twin simulator" }));
        expect(screen.getByRole("button", { name: /Temperature: 20 ºC/ })).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText("Temperature"), { target: { value: "42" } });
        expect(latest.digitalTwinSimulatorState.temperature).toBe(42);
        expect(screen.getByRole("button", { name: "Get last measurements" })).toBeInTheDocument();
    });
});
