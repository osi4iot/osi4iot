import { beforeAll, describe, expect, it, vi } from "vitest";
import { isPendingViewerImage, loadViewerImage, onViewerImageChange, setPendingViewerImages } from "./viewerImagesApi";

const auth = { accessToken: "t", refreshToken: "r", authDispatch: () => {} };

describe("images of a .zip not saved yet", () => {
    beforeAll(() => {
        let n = 0;
        (URL as any).createObjectURL = vi.fn(() => `blob:${++n}`);
        (URL as any).revokeObjectURL = vi.fn();
    });

    it("are shown by the Picture panels until they are dropped", async () => {
        const changed = vi.fn();
        const off = onViewerImageChange(changed);
        const svg = new TextEncoder().encode("<svg/>");
        await setPendingViewerImages(7, 12, [{ fileName: "status.svg", data: svg }]);
        expect(changed).toHaveBeenCalledWith(7, 12, "status.svg");
        expect(isPendingViewerImage(7, 12, "status.svg")).toBe(true);
        expect(isPendingViewerImage(7, 13, "status.svg")).toBe(false);
        const image = await loadViewerImage(7, 12, "status.svg", auth);
        expect(image?.svg).toBe("<svg/>");
        await setPendingViewerImages(7, 12, null);
        expect(isPendingViewerImage(7, 12, "status.svg")).toBe(false);
        expect(URL.revokeObjectURL).toHaveBeenCalledWith(image?.url);
        expect(changed).toHaveBeenCalledTimes(2);
        off();
    });
});
