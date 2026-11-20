import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../../../../contexts/authContext/authContext", () => ({ useLoggedUserLogin: () => "tester" }));

import ChatAssistant, { ChatMessage } from "./ChatAssistant";
import { ChatAttachmentService, attachmentKindOf, sanitizeAttachments } from "./chatAttachments";

beforeAll(() => {
    // jsdom no tiene URL.createObjectURL
    (URL as any).createObjectURL = vi.fn(() => "blob:preview");
    (URL as any).revokeObjectURL = vi.fn();
});

const makeService = (enabled = true): ChatAttachmentService => ({
    enabled,
    maxSize: 10 * 1024 * 1024,
    textMaxSize: 1024 * 1024,
    types: ["image/jpeg", "image/png", "image/webp", "application/pdf"],
    retentionDays: 30,
    upload: vi.fn(async (_blob: Blob, name: string) => {
        const ext = name.split(".").pop() === "pdf" ? "pdf" : "jpg";
        return { file: `2026-11-17/abcdefghij.${ext}`, name, mimeType: ext === "pdf" ? "application/pdf" : "image/jpeg", size: 1234 };
    }),
    imageUrl: vi.fn(async () => "blob:image"),
});

const renderChat = (service: ChatAttachmentService | null, messages: ChatMessage[] = []) => {
    let latest = messages;
    const setChatMessages = vi.fn((next: any) => {
        latest = typeof next === "function" ? next(latest) : next;
    });
    render(
        <ChatAssistant
            embedded
            visible
            chatMessages={messages}
            setChatMessages={setChatMessages}
            chatAssistantLanguage="es-ES"
            handleRemoveChatAssistantHistory={() => {}}
            attachmentService={service}
        />,
    );
    return () => latest;
};

describe("sanitizeAttachments", () => {
    it("deja solo referencias válidas, como mucho 4", () => {
        expect(sanitizeAttachments("x")).toBeUndefined();
        expect(sanitizeAttachments([{ file: "../../etc/passwd" }])).toBeUndefined();
        const many = Array.from({ length: 6 }, (_, i) => ({ file: `2026-11-17/abcdefgh${i}.png`, name: "n" }));
        const out = sanitizeAttachments([{ file: "2026-11-17/abcdefgh.jpg", size: -3 }, ...many]);
        expect(out).toHaveLength(4);
        expect(out?.[0]).toEqual({ file: "2026-11-17/abcdefgh.jpg", name: "", mimeType: "", size: 0 });
    });
});

describe("tablas adjuntas", () => {
    it("acepta CSV y Excel como tablas", () => {
        expect(attachmentKindOf("medidas.CSV")).toBe("table");
        expect(attachmentKindOf("2026-11-19/abcdefghij.xlsx")).toBe("table");
        expect(attachmentKindOf("viejo.xls")).toBeNull();
        expect(sanitizeAttachments([{ file: "2026-11-19/abcdefghij.xlsx", name: "ventas.xlsx" }])).toHaveLength(1);
    });
});

describe("ChatAssistant con adjuntos", () => {
    it("sin servicio, o con el grupo sin adjuntos, no hay clip", () => {
        renderChat(null);
        expect(screen.queryByTestId("chat-attach-button")).toBeNull();
    });

    it("con el grupo sin adjuntos no hay clip, pero se ven las imágenes de los mensajes", async () => {
        const service = makeService(false);
        renderChat(service, [
            {
                userName: "tester",
                sender: "user",
                time: "10:00:00",
                mcpToolCalls: [],
                message: "",
                attachments: [{ file: "2026-11-17/abcdefghij.jpg", name: "pizarra.jpg", mimeType: "image/jpeg", size: 1 }],
            },
        ]);
        expect(screen.queryByTestId("chat-attach-button")).toBeNull();
        await waitFor(() => expect(screen.getByAltText("pizarra.jpg")).toBeTruthy());
        expect(service.imageUrl).toHaveBeenCalledWith("2026-11-17/abcdefghij.jpg");
    });

    it("sube la imagen al elegirla y la envía con la pregunta, aunque no haya texto", async () => {
        const service = makeService();
        const latest = renderChat(service);
        const send = screen.getByRole("button", { name: "Send" }) as HTMLButtonElement;
        expect(send.disabled).toBe(true);
        const file = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], "formula.jpg", { type: "image/jpeg" });
        await act(async () => {
            fireEvent.change(screen.getByTestId("chat-attach-input"), { target: { files: [file] } });
        });
        await waitFor(() => expect(service.upload).toHaveBeenCalled());
        await waitFor(() => expect(send.disabled).toBe(false));
        expect(screen.getByTestId("chat-pending-attachments")).toBeTruthy();
        fireEvent.click(send);
        expect(latest().at(-1)).toMatchObject({
            sender: "user",
            message: "",
            attachments: [{ file: "2026-11-17/abcdefghij.jpg", name: "formula.jpg" }],
        });
        expect(screen.queryByTestId("chat-pending-attachments")).toBeNull();
    });

    it("adjunta un PDF tal cual y lo muestra con su icono y su nombre", async () => {
        const service = makeService();
        const latest = renderChat(service);
        const pdf = new File(["%PDF-1.7 ..."], "enunciado.pdf", { type: "application/pdf" });
        await act(async () => {
            fireEvent.change(screen.getByTestId("chat-attach-input"), { target: { files: [pdf] } });
        });
        await waitFor(() => expect(service.upload).toHaveBeenCalled());
        // sin redimensionar: el mismo archivo
        expect((service.upload as any).mock.calls[0][0]).toBe(pdf);
        expect(screen.getByTestId("chat-pending-attachments")).toHaveTextContent("enunciado.pdf");
        const send = screen.getByRole("button", { name: "Send" }) as HTMLButtonElement;
        await waitFor(() => expect(send.disabled).toBe(false));
        fireEvent.click(send);
        expect(latest().at(-1)?.attachments?.[0]).toMatchObject({ file: "2026-11-17/abcdefghij.pdf", name: "enunciado.pdf" });
    });

    it("no sube lo que no se puede adjuntar, ni un texto de más de 1 MB", async () => {
        const service = makeService();
        renderChat(service);
        const exe = new File(["MZ"], "setup.exe", { type: "application/octet-stream" });
        const big = new File([new Uint8Array(1024 * 1024 + 1)], "notas.txt", { type: "text/plain" });
        await act(async () => {
            fireEvent.change(screen.getByTestId("chat-attach-input"), { target: { files: [exe, big] } });
        });
        await waitFor(() => expect(screen.getByTitle(/setup\.exe: Images, PDF, Word/)).toBeTruthy());
        expect(screen.getByTitle("notas.txt: Larger than 1 MB")).toBeTruthy();
        expect(service.upload).not.toHaveBeenCalled();
    });

    it("muestra los documentos de un mensaje con su nombre", () => {
        renderChat(makeService(), [
            {
                userName: "tester",
                sender: "user",
                time: "10:00:00",
                mcpToolCalls: [],
                message: "Corrige el ejercicio 2",
                attachments: [{ file: "2026-11-17/abcdefghij.docx", name: "examen_juan.docx", mimeType: "", size: 1 }],
            },
        ]);
        expect(screen.getByTestId("chat-message-document")).toHaveTextContent("examen_juan.docx");
        expect(screen.getByTitle("Download examen_juan.docx")).toBeTruthy();
    });

    it("muestra una tabla adjunta, que se descarga", () => {
        renderChat(makeService(), [
            {
                userName: "tester",
                sender: "user",
                time: "10:00:00",
                mcpToolCalls: [],
                message: "Media por sensor",
                attachments: [{ file: "2026-11-19/abcdefghij.csv", name: "medidas.csv", mimeType: "", size: 1 }],
            },
        ]);
        expect(screen.getByTestId("chat-message-document")).toHaveTextContent("medidas.csv");
        expect(screen.getByTitle("Download medidas.csv")).toBeTruthy();
    });
});
