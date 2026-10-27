import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { ModalProvider } from "react-modal-hook";
import ReactModal from "react-modal";
import DeleteModalWithDatePicker from "./DeleteModalWithDatePicker";

// Modal con react-modal + react-modal-hook + react-datepicker 9 sobre React 19.
const Harness = ({ action }: { action: (hide: () => void, date: Date) => void }) => {
    const [selectedDate, setSelectedDate] = useState(new Date(2026, 9, 15, 10, 0));
    const [showModal] = DeleteModalWithDatePicker(
        "DELETE MEASUREMENTS",
        "Delete measurements before the selected date?",
        "Measurements will be lost.",
        action,
        false,
        () => {},
        selectedDate,
        setSelectedDate,
    );
    return (
        <>
            <button onClick={showModal}>open</button>
            <span data-testid="selected">{selectedDate.toISOString()}</span>
        </>
    );
};

describe("DeleteModalWithDatePicker", () => {
    it("abre el modal, cambia la fecha con el calendario y ejecuta la acción", () => {
        const root = document.createElement("div");
        root.id = "root";
        document.body.appendChild(root);
        ReactModal.setAppElement(root);
        const action = vi.fn((hide: () => void, _date: Date) => hide());
        render(
            <ModalProvider>
                <Harness action={action} />
            </ModalProvider>,
            { container: root },
        );
        fireEvent.click(screen.getByText("open"));
        const dialog = screen.getByRole("dialog");
        expect(within(dialog).getByText("DELETE MEASUREMENTS")).toBeInTheDocument();
        // calendario inline de react-datepicker con el mes seleccionado
        expect(dialog.querySelector(".react-datepicker__month-container")).not.toBeNull();
        const day20 = dialog.querySelector(".react-datepicker__day--020:not(.react-datepicker__day--outside-month)") as HTMLElement;
        fireEvent.click(day20);
        expect(new Date(screen.getByTestId("selected").textContent!).getDate()).toBe(20);
        fireEvent.click(within(screen.getByRole("dialog")).getByText("DELETE"));
        expect(action).toHaveBeenCalledTimes(1);
        expect((action.mock.calls[0][1] as Date).getDate()).toBe(20);
        expect(screen.queryByRole("dialog")).toBeNull();
    });
});
