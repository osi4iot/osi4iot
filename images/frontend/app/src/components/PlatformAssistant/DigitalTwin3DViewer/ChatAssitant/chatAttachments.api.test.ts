import { describe, expect, it, vi } from "vitest";

const get = vi.fn(async (..._args: any[]): Promise<any> => ({ data: { enabled: true, maxSize: 1, types: [], retentionDays: 30 } }));
const post = vi.fn(async (..._args: any[]): Promise<any> => ({ data: { file: "2026-11-17/abcdefghij.jpg", name: "a.jpg", mimeType: "image/jpeg", size: 1 } }));
vi.mock("../../../../tools/axiosIntance", () => ({ getAxiosInstance: () => ({ get, post }) }));

import { chatAttachmentImageUrl, fetchChatAttachmentsConfig, uploadChatAttachment } from "./chatAttachments";

// las rutas de admin_api (components/chatAttachment/chatAttachment.controller.ts)
describe("direcciones de admin_api de los adjuntos", () => {
    const auth = { accessToken: "t", refreshToken: "r", authDispatch: () => {} };
    it("usa /admin_api/chat_attachment_enabled, _upload y _file", async () => {
        (URL as any).createObjectURL = vi.fn(() => "blob:x");
        expect(await fetchChatAttachmentsConfig(7, 12, auth)).toMatchObject({ enabled: true });
        expect(get.mock.calls[0][0]).toMatch(/\/admin_api\/chat_attachment_enabled\/7\/12$/);
        await uploadChatAttachment(7, 12, new Blob(["x"]), "a.jpg", auth);
        expect(post.mock.calls[0][0]).toMatch(/\/admin_api\/chat_attachment_upload\/7\/12$/);
        // la imagen va como formulario multipart (si no, multer no recibe el archivo)
        expect(post.mock.calls[0][1]).toBeInstanceOf(FormData);
        expect(post.mock.calls[0][2].headers["Content-Type"]).toBe("multipart/form-data");
        get.mockResolvedValueOnce({ data: new Blob(["x"]) } as any);
        await chatAttachmentImageUrl(7, 12, "2026-11-17/abcdefghij.jpg", auth);
        expect(get.mock.calls[1][0]).toMatch(/\/admin_api\/chat_attachment_file\/7\/12\/2026-11-17\/abcdefghij\.jpg$/);
    });
});
