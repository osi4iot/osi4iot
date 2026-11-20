import { afterEach, describe, expect, it, vi } from "vitest";
import { prepareAttachmentImage } from "./chatAttachments";

// Una foto de móvil vertical: el <img> la entrega ya girada por su EXIF (3000 x 4000)
describe("prepareAttachmentImage", () => {
    const originalImage = globalThis.Image;
    const originalCreate = document.createElement.bind(document);
    afterEach(() => {
        globalThis.Image = originalImage;
        document.createElement = originalCreate;
        vi.restoreAllMocks();
    });

    it("decodifica la foto derecha (EXIF) y la reduce a 1024 px en JPEG, aunque ya sea pequeña", async () => {
        (URL as any).createObjectURL = vi.fn(() => "blob:photo");
        (URL as any).revokeObjectURL = vi.fn();
        class FakeImage {
            decoding = "";
            src = "";
            naturalWidth = 3000;
            naturalHeight = 4000;
            decode() {
                return Promise.resolve();
            }
        }
        globalThis.Image = FakeImage as any;
        const drawImage = vi.fn();
        const canvas = {
            width: 0,
            height: 0,
            getContext: () => ({ fillStyle: "", fillRect: vi.fn(), drawImage }),
            toBlob: (cb: (b: Blob) => void, type: string) => cb(new Blob(["jpeg"], { type })),
        };
        document.createElement = ((tag: string) => (tag === "canvas" ? canvas : originalCreate(tag))) as any;

        const out = await prepareAttachmentImage(new File(["x"], "IMG_0001.jpg", { type: "image/jpeg" }));
        expect(canvas.width).toBe(768);
        expect(canvas.height).toBe(1024); // vertical, como se hizo la foto
        expect(drawImage.mock.calls[0][0]).toBeInstanceOf(FakeImage);
        expect(out.name).toBe("IMG_0001.jpg");
        expect(out.blob.type).toBe("image/jpeg");
        expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:photo");
    });
});
