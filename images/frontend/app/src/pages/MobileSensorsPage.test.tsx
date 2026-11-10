import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const topics = [
    { id: 1, orgAcronym: "EEBE", groupAcronym: "EEBE_GRAL", assetDescription: "Mobile for group EEBE_GRAL", sensorType: "Mobile geolocation", sensorDescription: "Mobile geolocation", groupUid: "g", assetUid: "wAdh", topicUid: "t1" },
    { id: 2, orgAcronym: "EEBE", groupAcronym: "EEBE_GRAL", assetDescription: "Portico biempotrado Yolo", sensorType: "Mobile video", sensorDescription: "Mobile video sensor", groupUid: "g", assetUid: "mdPF", topicUid: "t2" },
];
vi.mock("../tools/axiosIntance", () => ({ getAxiosInstance: () => ({ get: () => Promise.resolve({ data: topics }) }) }));
vi.mock("../tools/Natsconnection", () => ({ default: () => new Promise(() => {}) }));
vi.mock("../components/Layout/Header", () => ({ default: () => null }));
// the sensor's form: only its Cancel (back to the selection)
vi.mock("../components/Tools/MobileVideoForm", () => ({
    default: ({ setMobileSensorSelected, mobileTopicSelected }: any) => (
        <div>
            <p>Video form of {mobileTopicSelected.assetDescription}</p>
            <button onClick={() => setMobileSensorSelected("none")}>Cancel</button>
        </div>
    ),
}));

import { AuthProvider } from "../contexts/authContext";
import MobileSensorsPage from "./MobileSensorsPage";

// the react-selects of the form, in order: org, group, asset, sensor
const choose = async (index: number, option: string) => {
    const input = screen.getAllByRole("combobox")[index];
    fireEvent.keyDown(input, { key: "ArrowDown" });
    await act(async () => fireEvent.click(await screen.findByText(option)));
};

const renderPage = async () => {
    await act(async () => {
        render(
            <AuthProvider>
                <MemoryRouter>
                    <MobileSensorsPage />
                </MemoryRouter>
            </AuthProvider>,
        );
    });
};

describe("mobile sensors page", () => {
    beforeEach(() => window.localStorage.clear());

    it("keeps the sensor chosen when going back from its form, ", async () => {
        await renderPage();
        expect(screen.getByText("Mobile for group EEBE_GRAL")).toBeInTheDocument();
        await choose(2, "Portico biempotrado Yolo");
        await act(async () => fireEvent.click(screen.getByRole("button", { name: "Next" })));
        expect(screen.getByText("Video form of Portico biempotrado Yolo")).toBeInTheDocument();
        await act(async () => fireEvent.click(screen.getByRole("button", { name: "Cancel" })));
        expect(screen.getByText("Portico biempotrado Yolo")).toBeInTheDocument();
        expect(screen.getByText("Mobile video sensor")).toBeInTheDocument();
        expect(screen.getByText("Asset_mdPF")).toBeInTheDocument();
    });

    it("opens with the sensor chosen on the last visit", async () => {
        window.localStorage.setItem("osi4iot.mobileSensors", JSON.stringify({ selection: { topicUid: "t2" } }));
        await renderPage();
        expect(screen.getByText("Portico biempotrado Yolo")).toBeInTheDocument();
        expect(screen.getByText("Mobile video sensor")).toBeInTheDocument();
    });
});
