import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { SignalNodeSettings } from "./SignalNodesSettings";
import { POSE_PARTS_EXAMPLE, SIGNAL_DEFAULT_SETTINGS, isSignalNode, parseJsonSetting, poseEstimationProblems } from "./signalNodes";
import { NODE_HELP } from "./nodeHelp";

const points = JSON.stringify({
    Hub: [0.001, 0.306, 1.145],
    pilar_center: [0.001, 0.194, 0.788],
    pontoon_center_front: [0.001, 0.481, 0.35],
    pontoon_center_left: [0.28, -0.003, 0.35],
    pontoon_center_right: [-0.278, -0.003, 0.35],
    pontoon_front_1: [-0.032, 0.428, 0.341],
    Blade_1: [0.001, 0.306, 1.645],
    Blade_2: [0.434, 0.306, 0.895],
    Blade_3: [-0.432, 0.306, 0.895],
});

describe("Pose estimation node", () => {
    it("is a signal node; its defaults only miss the 3D points", () => {
        expect(isSignalNode("PoseEstimation")).toBe(true);
        expect(poseEstimationProblems(SIGNAL_DEFAULT_SETTINGS.PoseEstimation)).toEqual(["The 3D points of the object are required."]);
        expect(poseEstimationProblems({ ...SIGNAL_DEFAULT_SETTINGS.PoseEstimation, points })).toEqual([]);
        expect(NODE_HELP.PoseEstimation).toBeDefined();
    });

    it("checks the JSON settings like pipelines", () => {
        expect(parseJsonSetting("")).toEqual({});
        expect(parseJsonSetting({ a: 1 })).toEqual({ value: { a: 1 } });
        expect(parseJsonSetting("{oops").error).toBeTruthy();
        const base = { ...SIGNAL_DEFAULT_SETTINGS.PoseEstimation, points };
        expect(poseEstimationProblems({ ...base, points: "{oops" })[0]).toMatch(/not valid JSON/);
        expect(poseEstimationProblems({ ...base, calibration: "[1, 2]" })[0]).toMatch(/JSON object/);
        expect(poseEstimationProblems({ ...base, parts: POSE_PARTS_EXAMPLE })).toEqual([]);
        expect(poseEstimationProblems({ ...base, parts: '[{"name": "r", "keypoints": []}]' })).toEqual(
            expect.arrayContaining(["Part 1 needs keypoints.", "Part 1 needs an axisDirection [x, y, z]."]),
        );
        // 9 points, 3 in the rotor: 6 left for the rigid body; minimum 7 is too many
        expect(poseEstimationProblems({ ...base, parts: POSE_PARTS_EXAMPLE, minPoints: 7 })[0]).toMatch(/Minimum points/);
        expect(poseEstimationProblems({ ...base, minConfidence: 2, fovDeg: 200 })).toHaveLength(2);
        expect(poseEstimationProblems({ ...base, fovSide: "diagonal" as never })[0]).toMatch(/side/);
        // the OC4 rotor: blades given by their angles at rest, not in the 3D points
        const rotor = JSON.stringify([{ name: "rotor", keypoints: ["blade_red_1", "blade_blue_1"], axisDirection: [0, 1, 0], restAngles: { blade_red_1: 0, blade_blue_1: 120 } }]);
        expect(poseEstimationProblems({ ...base, parts: rotor })).toEqual(["Part 1: restAngles need zeroDirection (where 0° is)."]);
        const withZero = rotor.replace('"restAngles"', '"zeroDirection": [0, 0, 1], "restAngles"');
        expect(poseEstimationProblems({ ...base, parts: withZero, keypointNamesByClass: '{"WindTurbine": ["Hub"], "Rotor": ["blade_red_1"]}' })).toEqual([]);
        expect(poseEstimationProblems({ ...base, keypointNamesByClass: "[1]" })[0]).toMatch(/by class must be an object/);
    });

    it("edits the JSON as text and shows the field of view only without calibration", () => {
        const Harness = () => {
            const [s, setS] = useState<Record<string, any>>({ ...SIGNAL_DEFAULT_SETTINGS.PoseEstimation });
            return <SignalNodeSettings type="PoseEstimation" formData={s} onChange={(k, v) => setS((p) => ({ ...p, [k]: v }))} topicRefs={[]} />;
        };
        render(<Harness />);
        expect(screen.getByRole("alert").textContent).toMatch(/3D points/);
        fireEvent.change(screen.getByLabelText("3D points"), { target: { value: points } });
        expect(screen.queryByRole("alert")).toBeNull();
        expect(screen.getByLabelText("Field of view (°)")).toBeTruthy();
        fireEvent.change(screen.getByLabelText("Calibration"), { target: { value: '{"camera_matrix": [[1000, 0, 640], [0, 1000, 360], [0, 0, 1]]}' } });
        expect(screen.queryByLabelText("Field of view (°)")).toBeNull();
        fireEvent.change(screen.getByLabelText("Pose mode"), { target: { value: "object" } });
        expect(screen.getByLabelText("Object node")).toBeTruthy();
    });

    it("shows a value imported as an object as formatted JSON", () => {
        render(<SignalNodeSettings type="PoseEstimation" formData={{ ...SIGNAL_DEFAULT_SETTINGS.PoseEstimation, points: { Hub: [0, 1, 2] } }} onChange={() => {}} topicRefs={[]} />);
        expect((screen.getByLabelText("3D points") as HTMLTextAreaElement).value).toContain('"Hub": [');
    });
});
