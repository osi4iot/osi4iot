import { act, fireEvent, render, screen } from "@testing-library/react";
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { describe, expect, it } from "vitest";
import ModelSlot, { createModelHost } from "./ModelSlot";

// stands for the 3D scene: its state is lost if it is mounted again
const Scene = () => {
    const [clicks, setClicks] = useState(0);
    return <button onClick={() => setClicks(clicks + 1)}>scene {clicks}</button>;
};

const Page = ({ slide }: { slide: number }) => {
    const host = useMemo(createModelHost, []);
    return (
        <>
            {createPortal(<Scene />, host)}
            {slide === 1 && <section aria-label="slide 1"><ModelSlot host={host} /></section>}
            {slide === 2 && <section aria-label="slide 2"><div><ModelSlot host={host} /></div></section>}
        </>
    );
};

describe("model slot", () => {
    it("moves the same scene between the slides, without mounting it again", () => {
        const { rerender } = render(<Page slide={1} />);
        fireEvent.click(screen.getByRole("button", { name: "scene 0" }));
        expect(screen.getByRole("region", { name: "slide 1" })).toContainElement(screen.getByRole("button", { name: "scene 1" }));
        act(() => rerender(<Page slide={3} />));
        expect(screen.queryByRole("button", { name: "scene 1" })).toBeNull();
        act(() => rerender(<Page slide={2} />));
        expect(screen.getByRole("region", { name: "slide 2" })).toContainElement(screen.getByRole("button", { name: "scene 1" }));
    });
});
