import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_VIEWER_OPTIONS } from "../Utils/constants";
import { ViewerOptions } from "../Types/types";
import Inspector from "./Inspector";
import DigitalTwinSimulatorModal from "../ViewerTools/DigitalTwinSimulatorModal";
import { withOptionAt } from "./optionsUpdate";

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

const Harness = ({ simulator = {} as Record<string, any> }) => {
    const [opts, setOpts] = useState<ViewerOptions>(baseOpts);
    latest = opts;
    return (
        <Inspector
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
        />
    );
};

describe("DigitalTwinSimulatorModal", () => {
    it("parte de los valores por defecto, los botones − / + avanzan un paso y Stop deja de enviar", () => {
        const updates: Record<string, number>[] = [];
        const show = vi.fn();
        const send = vi.fn();
        render(
            <DigitalTwinSimulatorModal
                digitalTwinSimulatorFormat={{
                    temp: { label: "Temperature", units: "ºC", minValue: 0, maxValue: 50, defaultValue: 20, step: 0.5, topicId: 1 },
                }}
                setShowDigitalTwinSimulator={show}
                updateDigitalTwinSimulatorState={(state) => updates.push(state)}
                setDigitalTwinSimulatorSendData={send}
            />,
        );
        expect(updates.at(-1)).toEqual({ temp: 20 });
        fireEvent.click(screen.getByRole("button", { name: "Increase Temperature" }));
        expect(updates.at(-1)).toEqual({ temp: 20.5 });
        fireEvent.click(screen.getByRole("button", { name: "Stop simulation" }));
        expect(show).toHaveBeenCalledWith(false);
        expect(send).toHaveBeenCalledWith(false);
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

describe("Inspector", () => {
    it("muestra solo las pestañas con contenido", () => {
        render(<Harness />);
        const tabs = screen.getAllByRole("tab").map((t) => t.textContent);
        expect(tabs).toEqual(["Scene", "Sensors", "Generic", "System"]);
        expect(screen.getByRole("tab", { name: "Generic objects" })).toBeInTheDocument();
    });

    it("el interruptor de la luz ambiente cambia ambientLight (antes escribía 'ambientLigth')", () => {
        render(<Harness />);
        const sw = screen.getByRole("switch", { name: "Ambient light" });
        expect(sw).toHaveAttribute("aria-checked", "true");
        fireEvent.click(sw);
        expect(latest.ambientLight).toBe(false);
        expect((latest as any).ambientLigth).toBeUndefined();
    });

    it("el valor del deslizador se puede escribir y se ajusta al rango y al paso", () => {
        render(<Harness />);
        fireEvent.click(screen.getByRole("button", { name: /Intensity: 1.00/ }));
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
