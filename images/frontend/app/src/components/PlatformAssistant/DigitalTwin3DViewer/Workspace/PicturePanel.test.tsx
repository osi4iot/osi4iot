import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ColorField, PictureEditor } from "./PicturePanel";
import { LiveTopic, createLiveValueStore, liveTopicsOf } from "./liveValues";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g id="needle"><line x2="10"/></g><text id="rpmText"><tspan>0</tspan></text></svg>`;
const files = { load: vi.fn(async () => ({ url: "", svg })), list: vi.fn(async () => [{ fileName: "oc4.svg", lastModified: "", size: 100 }]), upload: vi.fn(), remove: vi.fn() };
const topics: LiveTopic[] = [
    { ref: "dtm2sim", label: "dtm2sim · sent by the pipeline to the viewer" },
    { ref: "dev2sim", label: "dev2sim · sent by the devices to the viewer" },
    { ref: "dev2pdb_2", label: "dev2pdb_2 · sensors: Wind speed", fields: [{ path: "windSpeed", label: "Wind speed", units: "m/s", sensor: "Wind speed" }] },
];

const open = async (store = createLiveValueStore(), onApply = vi.fn()) => {
    render(<PictureEditor panel={{ id: "picture-1", type: "picture", file: "oc4.svg", x: 0, y: 0, w: 4, h: 4 }} store={store} topics={topics} files={files as any} onApply={onApply} onDiscard={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Add an animation" })).toBeEnabled());
    return onApply;
};

describe("picture editor", () => {
    it("writes the field of dtm2sim (offering those seen) and tells what the value does now", async () => {
        const store = createLiveValueStore();
        store.publish("dtm2sim", { rotorRpm: 11.4, camera: { position: [1, 2, 3] } });
        const onApply = await open(store);
        fireEvent.click(screen.getByRole("button", { name: "Add an animation" }));
        const card = screen.getByRole("group", { name: "Animation 1" });
        expect(within(card).getByText("choose the field of the value")).toBeInTheDocument();
        // dtm2sim: written; the plain fields seen are offered
        fireEvent.click(within(card).getByRole("button", { name: "rotorRpm" }));
        expect(within(card).getByRole("textbox", { name: "Field" })).toHaveValue("rotorRpm");
        fireEvent.change(within(card).getByRole("combobox", { name: "Action" }), { target: { value: "rotate" } });
        fireEvent.change(within(card).getByRole("spinbutton", { name: "Value to" }), { target: { value: "20" } });
        fireEvent.change(within(card).getByRole("spinbutton", { name: "Degrees from" }), { target: { value: "-90" } });
        fireEvent.change(within(card).getByRole("spinbutton", { name: "Degrees to" }), { target: { value: "90" } });
        expect(within(card).getByText("11.4 → 12.6°")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Apply" }));
        expect(onApply.mock.calls[0][0].bindings[0]).toMatchObject({ element: "needle", topicRef: "dtm2sim", path: "rotorRpm", action: "rotate", inMin: 0, inMax: 20, outMin: -90, outMax: 90 });
    });

    it("chooses the field of a dev2pdb topic among its sensors' fields", async () => {
        await open();
        fireEvent.click(screen.getByRole("button", { name: "Add an animation" }));
        const card = screen.getByRole("group", { name: "Animation 1" });
        fireEvent.change(within(card).getByRole("combobox", { name: "Topic" }), { target: { value: "dev2pdb_2" } });
        const field = within(card).getByRole("combobox", { name: "Field" }) as HTMLSelectElement;
        expect(Array.from(field.options).map((o) => o.text)).toEqual(["Choose a sensor field…", "Wind speed (m/s) — Wind speed · windSpeed"]);
        fireEvent.change(field, { target: { value: "windSpeed" } });
        expect(within(card).getByText("no value of dev2pdb_2.windSpeed yet")).toBeInTheDocument();
    });

    it("lists only the sensors' topics, dtm2sim and dev2sim, with the fields of the sensors", () => {
        const data = ["dtm2sim", "dev2sim", "sim2dtm", "llm2sim", "dev2pdb_2", "dev2pdb_1", "dev2dtm_1"].map((ref, i) => ({ topicId: i, topicRef: ref, natsSubject: `${ref}/x`, lastMeasurement: null }));
        const fields = [{ sensor: "sensor_6", field: "windSpeed", label: "Wind speed", units: "m/s", sensorDescription: "Wind speed" }];
        const list = liveTopicsOf(data as any, fields, { sensor_6: "dev2pdb_2" });
        expect(list.map((t) => t.ref)).toEqual(["dtm2sim", "dev2sim", "dev2pdb_1", "dev2pdb_2"]);
        expect(list[3]).toMatchObject({ label: "dev2pdb_2 · sensors: Wind speed", fields: [{ path: "windSpeed", label: "Wind speed" }] });
    });

    it("marks a colour that is not valid and does not take it", () => {
        const onChange = vi.fn();
        render(<ColorField label="Colour" value="#73bf69" onChange={onChange} />);
        const text = screen.getByRole("textbox", { name: "Colour" });
        fireEvent.change(text, { target: { value: "#12" } });
        expect(text).toHaveAttribute("aria-invalid", "true");
        expect(onChange).not.toHaveBeenCalled();
        fireEvent.change(text, { target: { value: "#FF8800" } });
        expect(onChange).toHaveBeenCalledWith("#ff8800");
    });
});
