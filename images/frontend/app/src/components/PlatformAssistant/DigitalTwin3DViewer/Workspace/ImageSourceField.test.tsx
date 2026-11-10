import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ImageSourceField from "./ImageSourceField";
import { imageSourceOptions } from "./workspaceLayout";

const options = imageSourceOptions(["dtm2sim", "dev2dtm_1", "dev2dtm_2"], ["dev2dtm_2"]);

describe("source of an Image panel", () => {
    it("offers the pipeline, the device topics by number and any other topic", () => {
        const onChange = vi.fn();
        render(<ImageSourceField value="any" options={options} onChange={onChange} />);
        const kind = screen.getByRole("combobox", { name: "Source" });
        const labels = Array.from((kind as HTMLSelectElement).options).map((o) => o.text);
        expect(labels).toEqual(["All images · receiving images", "Pipeline images (dtm2sim)", "Device (dev2dtm) · receiving images", "Other topic…"]);
        expect(labels.some((l) => l.includes("dev2sim"))).toBe(false);

        fireEvent.change(kind, { target: { value: "dev2dtm" } });
        expect(onChange).toHaveBeenLastCalledWith("dev2dtm_1");
        const number = screen.getByRole("combobox", { name: "Number of the device topic" });
        fireEvent.change(number, { target: { value: "2" } });
        expect(onChange).toHaveBeenLastCalledWith("dev2dtm_2");
        fireEvent.change(number, { target: { value: "5" } });
        expect(onChange).toHaveBeenLastCalledWith("dev2dtm_5");
        expect(screen.getByText(/The asset has no dev2dtm_5/)).toBeInTheDocument();
        fireEvent.change(number, { target: { value: "x" } });
        expect(onChange).toHaveBeenLastCalledWith(null);
        expect(number).toHaveAttribute("aria-invalid", "true");

        fireEvent.change(kind, { target: { value: "other" } });
        const other = screen.getByRole("textbox", { name: "Topic reference" });
        fireEvent.change(other, { target: { value: "my_topic" } });
        expect(onChange).toHaveBeenLastCalledWith("my_topic");
        fireEvent.change(other, { target: { value: "bad topic" } });
        expect(onChange).toHaveBeenLastCalledWith(null);
    });

    it("shows the device topic of a panel", () => {
        render(<ImageSourceField value="dev2dtm_3" options={options} onChange={vi.fn()} />);
        expect(screen.getByRole("combobox", { name: "Source" })).toHaveValue("dev2dtm");
        expect(screen.getByRole("combobox", { name: "Number of the device topic" })).toHaveValue("3");
    });
});
