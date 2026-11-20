// Adjuntos del chat: el botón del clip, los adjuntos pendientes de enviar y las miniaturas de los mensajes (las
// imágenes en miniatura; los documentos, un icono con su nombre que abre el PDF o descarga el archivo).
import React, { ChangeEvent, useCallback, useEffect, useRef, useState } from "react";
import styled from "styled-components";
import { FaFileAlt, FaFileExcel, FaFilePdf, FaFileWord, FaPaperclip, FaTimes } from "react-icons/fa";
import { asIcon } from "../../../../tools/icons";
import {
    ATTACHMENT_ACCEPT,
    AttachmentKind,
    ChatAttachmentRef,
    ChatAttachmentService,
    MAX_ATTACHMENTS_PER_MESSAGE,
    attachmentKindOf,
    prepareAttachmentImage,
} from "./chatAttachments";

const FaPaperclipIcon = asIcon(FaPaperclip);
const FaTimesIcon = asIcon(FaTimes);
const FaFilePdfIcon = asIcon(FaFilePdf);
const FaFileWordIcon = asIcon(FaFileWord);
const FaFileAltIcon = asIcon(FaFileAlt);
const FaFileExcelIcon = asIcon(FaFileExcel);

// el icono de un documento
const DocIcon: React.FC<{ kind: AttachmentKind | null }> = ({ kind }) =>
    kind === "pdf" ? (
        <FaFilePdfIcon />
    ) : kind === "word" ? (
        <FaFileWordIcon />
    ) : kind === "table" ? (
        <FaFileExcelIcon />
    ) : (
        <FaFileAltIcon />
    );

const megabytes = (bytes: number) => `${Math.round(bytes / (1024 * 1024))} MB`;

export interface PendingAttachment {
    id: number;
    name: string;
    kind: AttachmentKind | null;
    // la miniatura de una imagen ("" en un documento)
    previewUrl: string;
    ref?: ChatAttachmentRef; // ya subido
    error?: string;
}

// Los adjuntos que el usuario ha elegido para la próxima pregunta: se suben en cuanto se eligen
export const usePendingAttachments = (attachmentService: ChatAttachmentService | null) => {
    const service = attachmentService?.enabled ? attachmentService : null;
    const [pending, setPending] = useState<PendingAttachment[]>([]);
    const nextId = useRef(1);
    const pendingRef = useRef(pending);
    pendingRef.current = pending;

    const addFiles = useCallback(
        (files: File[]) => {
            if (!service) return;
            const room = MAX_ATTACHMENTS_PER_MESSAGE - pendingRef.current.length;
            for (const file of files.slice(0, Math.max(0, room))) {
                const id = nextId.current++;
                const kind = file.type.startsWith("image/") ? "image" : attachmentKindOf(file.name);
                const previewUrl = kind === "image" ? URL.createObjectURL(file) : "";
                setPending((prev) => [...prev, { id, name: file.name || (kind === "image" ? "image" : "document"), kind, previewUrl }]);
                const update = (change: Partial<PendingAttachment>) =>
                    setPending((prev) => prev.map((p) => (p.id === id ? { ...p, ...change } : p)));
                // las imágenes se reducen a 1024 px; los documentos se suben tal cual
                const prepared =
                    kind === "image"
                        ? prepareAttachmentImage(file)
                        : kind
                          ? Promise.resolve({ blob: file as Blob, name: file.name })
                          : Promise.reject(new Error("Images, PDF, Word (.docx), text (.txt), Markdown (.md), CSV or Excel (.xlsx)"));
                prepared
                    .then(({ blob, name }) => {
                        const limit = kind === "text" ? service.textMaxSize : service.maxSize;
                        if (blob.size > limit) throw new Error(`Larger than ${megabytes(limit)}`);
                        return service.upload(blob, name);
                    })
                    .then((ref) => update({ ref }))
                    .catch((error: Error) => update({ error: error.message || "Not uploaded" }));
            }
        },
        [service],
    );

    const remove = useCallback((id: number) => {
        setPending((prev) => {
            const gone = prev.find((p) => p.id === id);
            if (gone?.previewUrl) URL.revokeObjectURL(gone.previewUrl);
            return prev.filter((p) => p.id !== id);
        });
    }, []);

    // se envían: las miniaturas del mensaje las vuelve a pedir el chat (caché de chatAttachments.ts)
    const take = useCallback((): ChatAttachmentRef[] => {
        const refs = pendingRef.current.filter((p) => p.ref).map((p) => p.ref as ChatAttachmentRef);
        pendingRef.current.forEach((p) => p.previewUrl && URL.revokeObjectURL(p.previewUrl));
        pendingRef.current = [];
        setPending([]);
        return refs;
    }, []);

    // sin servicio (grupo sin adjuntos, otro gemelo): fuera los pendientes
    useEffect(() => {
        if (!service && pendingRef.current.length > 0) take();
    }, [service, take]);

    const uploading = pending.some((p) => !p.ref && !p.error);
    const ready = pending.some((p) => p.ref);
    return { pending, addFiles, remove, take, uploading, ready, pendingRef };
};

const AttachButtonStyled = styled.button`
    padding: 4px;
    border: none;
    border-radius: 50%;
    background-color: #3274d9; /* como el micrófono y la papelera */
    color: #fff;
    cursor: pointer;
    font-size: 0.85rem;
    width: 30px;
    height: 30px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;

    &:hover {
        background-color: #2461c0;
    }

    &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
`;

// El clip: en el móvil, Android deja elegir entre la cámara y los archivos (admite documentos y tablas)
export const AttachButton: React.FC<{
    service: ChatAttachmentService;
    disabled?: boolean;
    onFiles: (files: File[]) => void;
}> = ({ service, disabled, onFiles }) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const title = `Attach a photo (a formula, a sheet, a whiteboard…) a short document (PDF, Word, text) or a table (CSV, Excel). Kept ${service.retentionDays} days.`;
    const onChange = (e: ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files ?? []);
        e.target.value = ""; // se puede volver a elegir el mismo archivo
        if (files.length > 0) onFiles(files);
    };
    return (
        <>
            <AttachButtonStyled
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={disabled}
                title={title}
                aria-label="Attach a file"
                data-testid="chat-attach-button"
            >
                <FaPaperclipIcon />
            </AttachButtonStyled>
            <input
                ref={inputRef}
                type="file"
                accept={ATTACHMENT_ACCEPT}
                multiple
                style={{ display: "none" }}
                onChange={onChange}
                data-testid="chat-attach-input"
            />
        </>
    );
};

const PendingRow = styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 6px 8px 0;
`;

const PendingChip = styled.div<{ $error?: boolean }>`
    position: relative;
    width: 52px;
    height: 52px;
    border-radius: 6px;
    overflow: hidden;
    border: 1px solid ${({ $error }) => ($error ? "#c0392b" : "rgba(255, 255, 255, 0.25)")};

    img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
    }

    .doc {
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 2px;
        background: rgba(255, 255, 255, 0.06);
        color: #cfd6e0;
        font-size: 0.5rem;
        padding: 2px;
        text-align: center;
        word-break: break-all;
        overflow: hidden;
    }
    .doc svg {
        font-size: 1.1rem;
        flex: none;
    }

    .state {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0, 0, 0, 0.55);
        color: #fff;
        font-size: 0.55rem;
        text-align: center;
        padding: 2px;
    }

    button {
        position: absolute;
        top: 1px;
        right: 1px;
        width: 16px;
        height: 16px;
        border: none;
        border-radius: 50%;
        background: rgba(0, 0, 0, 0.7);
        color: #fff;
        font-size: 0.55rem;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        padding: 0;
    }
`;

export const PendingAttachments: React.FC<{ pending: PendingAttachment[]; onRemove: (id: number) => void }> = ({
    pending,
    onRemove,
}) =>
    pending.length === 0 ? null : (
        <PendingRow data-testid="chat-pending-attachments">
            {pending.map((p) => (
                <PendingChip key={p.id} $error={!!p.error} title={p.error ? `${p.name}: ${p.error}` : p.name}>
                    {p.previewUrl ? (
                        <img src={p.previewUrl} alt={p.name} />
                    ) : (
                        <div className="doc">
                            <DocIcon kind={p.kind} />
                            {p.name.length > 18 ? `${p.name.slice(0, 15)}…` : p.name}
                        </div>
                    )}
                    {!p.ref && <div className="state">{p.error ? "Error" : "Uploading…"}</div>}
                    <button type="button" onClick={() => onRemove(p.id)} aria-label={`Remove ${p.name}`}>
                        <FaTimesIcon />
                    </button>
                </PendingChip>
            ))}
        </PendingRow>
    );

const ThumbRow = styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 6px;
`;

const Thumb = styled.a`
    display: block;
    width: 96px;
    height: 72px;
    border-radius: 6px;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.25);
    background: rgba(0, 0, 0, 0.2);
    font-size: 0.6rem;
    color: inherit;
    text-decoration: none;

    img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
    }

    span {
        display: flex;
        width: 100%;
        height: 100%;
        align-items: center;
        justify-content: center;
        text-align: center;
        padding: 4px;
        opacity: 0.75;
        word-break: break-all;
    }
`;

const DocChip = styled.button`
    display: flex;
    align-items: center;
    gap: 8px;
    max-width: 220px;
    height: 40px;
    padding: 0 10px;
    border: 1px solid rgba(255, 255, 255, 0.25);
    border-radius: 6px;
    background: rgba(0, 0, 0, 0.2);
    color: inherit;
    font-size: 0.75rem;
    cursor: pointer;

    svg {
        flex: none;
        font-size: 1.1rem;
    }
    span {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    &:disabled {
        cursor: default;
        opacity: 0.7;
    }
`;

// Un documento de un mensaje: un PDF se abre en otra pestaña; Word y texto se descargan con su nombre
const AttachmentDoc: React.FC<{ attachment: ChatAttachmentRef; service: ChatAttachmentService | null }> = ({ attachment, service }) => {
    const [state, setState] = useState<"" | "opening" | "expired">("");
    const kind = attachmentKindOf(attachment.file);
    const label = attachment.name || "document";
    const open = () => {
        if (!service || state === "opening") return;
        // la pestaña se abre ya (si no, el navegador la bloquea al llegar el archivo)
        const tab = kind === "pdf" ? window.open("", "_blank") : null;
        setState("opening");
        service
            .imageUrl(attachment.file)
            .then((url) => {
                setState("");
                if (tab) {
                    tab.location.href = url;
                    return;
                }
                const a = document.createElement("a");
                a.href = url;
                a.download = label;
                document.body.appendChild(a);
                a.click();
                a.remove();
            })
            .catch(() => {
                tab?.close();
                setState("expired");
            });
    };
    return (
        <DocChip
            type="button"
            onClick={open}
            disabled={!service || state === "expired"}
            title={state === "expired" ? `${label} (no longer stored)` : kind === "pdf" ? `Open ${label}` : `Download ${label}`}
            data-testid="chat-message-document"
        >
            <DocIcon kind={kind} />
            <span>{state === "expired" ? "Expired" : state === "opening" ? "Opening…" : label}</span>
        </DocChip>
    );
};

const AttachmentThumb: React.FC<{ attachment: ChatAttachmentRef; service: ChatAttachmentService | null }> = ({
    attachment,
    service,
}) => {
    return attachmentKindOf(attachment.file) === "image" ? (
        <ImageThumb attachment={attachment} service={service} />
    ) : (
        <AttachmentDoc attachment={attachment} service={service} />
    );
};

const ImageThumb: React.FC<{ attachment: ChatAttachmentRef; service: ChatAttachmentService | null }> = ({
    attachment,
    service,
}) => {
    const [url, setUrl] = useState<string | null>(null);
    const [failed, setFailed] = useState(false);
    useEffect(() => {
        let alive = true;
        if (!service) return;
        service
            .imageUrl(attachment.file)
            .then((u) => alive && setUrl(u))
            .catch(() => alive && setFailed(true));
        return () => {
            alive = false;
        };
    }, [service, attachment.file]);
    const label = attachment.name || "image";
    return (
        <Thumb
            href={url ?? undefined}
            target="_blank"
            rel="noopener noreferrer"
            title={failed ? `${label} (no longer stored)` : label}
            onClick={(e) => !url && e.preventDefault()}
        >
            {url ? <img src={url} alt={label} /> : <span>📎 {failed ? "Expired" : label}</span>}
        </Thumb>
    );
};

// Las imágenes adjuntas a un mensaje
export const AttachmentThumbs: React.FC<{
    attachments?: ChatAttachmentRef[];
    service: ChatAttachmentService | null;
}> = ({ attachments, service }) =>
    !attachments || attachments.length === 0 ? null : (
        <ThumbRow data-testid="chat-message-attachments">
            {attachments.map((a) => (
                <AttachmentThumb key={a.file} attachment={a} service={service} />
            ))}
        </ThumbRow>
    );
