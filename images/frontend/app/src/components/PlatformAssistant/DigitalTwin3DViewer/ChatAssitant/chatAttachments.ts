// Archivos adjuntos al chat del gemelo digital: fotos (de la cámara del móvil o del ordenador), documentos de
// extensión moderada (PDF, Word .docx, texto .txt, Markdown .md) y tablas (CSV, Excel .xlsx: el agente las consulta
// con SQL, sin leerlas enteras).
//
// Se suben a admin_api (/chat_attachment), que los guarda en el bucket en la carpeta del usuario; la pregunta que
// va por NATS (sim2llm) lleva solo su referencia ("<AAAA-MM-DD>/<id>.<ext>") y el AI Agent del pipeline los lee
// de allí. Cada usuario solo puede leer los suyos: admin_api forma la ruta con el usuario de la sesión.
import { AxiosError } from "axios";
import { axiosAuth } from "../../../../tools/tools";
import { getAxiosInstance } from "../../../../tools/axiosIntance";
import axiosErrorHandler from "../../../../tools/axiosErrorHandler";
import { DOMAIN_NAME, PROTOCOL } from "../Utils/constants";

export interface ChatAttachmentRef {
    file: string; // "<AAAA-MM-DD>/<id>.<ext>"
    name: string;
    mimeType: string;
    size: number;
}

// lo que ofrece el visor al chat: subir adjuntos (si el grupo los tiene activados) y ver los de los mensajes
export interface ChatAttachmentService {
    enabled: boolean;
    maxSize: number;
    // un archivo de texto (.txt, .md): más pequeño
    textMaxSize: number;
    types: string[];
    retentionDays: number;
    upload: (file: Blob, name: string) => Promise<ChatAttachmentRef>;
    // URL local (blob:) de la imagen, para verla en el chat
    imageUrl: (file: string) => Promise<string>;
}

export interface ChatAttachmentsConfig {
    enabled: boolean;
    maxSize: number;
    textMaxSize: number;
    types: string[];
    retentionDays: number;
}

export interface ApiAuth {
    accessToken: string;
    refreshToken: string;
    authDispatch: any;
}

export const MAX_ATTACHMENTS_PER_MESSAGE = 4;
// lado mayor de las fotos que se suben: basta para leer una hoja o una pizarra, y el modelo de imagen cobra por píxel
export const ATTACHMENT_MAX_SIDE = 1024;
const ATTACHMENT_JPEG_QUALITY = 0.85;

const FILE_RE = /^\d{4}-\d{2}-\d{2}\/[A-Za-z0-9_-]{8,40}\.(jpg|png|webp|pdf|docx|txt|md|csv|xlsx)$/;

// lo que se puede adjuntar, por extensión (admin_api comprueba el contenido)
export const ATTACHMENT_ACCEPT =
    "image/*,application/pdf,.pdf,.docx,.txt,.md,text/plain,text/markdown,.csv,text/csv,.xlsx," +
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export type AttachmentKind = "image" | "pdf" | "word" | "text" | "table";

export const attachmentKindOf = (nameOrFile: string): AttachmentKind | null => {
    const ext = nameOrFile.toLowerCase().split(".").pop() ?? "";
    if (["jpg", "jpeg", "png", "webp", "heic", "heif", "gif", "bmp"].includes(ext)) return "image";
    if (ext === "pdf") return "pdf";
    if (ext === "docx") return "word";
    if (ext === "txt" || ext === "md" || ext === "markdown") return "text";
    if (ext === "csv" || ext === "xlsx") return "table";
    return null;
};

// admin_api publica las rutas como /chat_attachment_enabled, /chat_attachment_upload y /chat_attachment_file
const baseUrl = () => `${PROTOCOL}://${DOMAIN_NAME}/admin_api`;

// Los adjuntos de un mensaje (de NATS o del historial): solo los válidos
export const sanitizeAttachments = (value: unknown): ChatAttachmentRef[] | undefined => {
    if (!Array.isArray(value)) return undefined;
    const out: ChatAttachmentRef[] = [];
    for (const item of value) {
        if (!item || typeof item !== "object") continue;
        const { file, name, mimeType, size } = item as Record<string, unknown>;
        if (typeof file !== "string" || !FILE_RE.test(file)) continue;
        out.push({
            file,
            name: typeof name === "string" ? name.slice(0, 120) : "",
            mimeType: typeof mimeType === "string" ? mimeType : "",
            size: typeof size === "number" && size > 0 ? size : 0,
        });
        if (out.length === MAX_ATTACHMENTS_PER_MESSAGE) break;
    }
    return out.length > 0 ? out : undefined;
};

// null si no se pudo leer (plataformas anteriores sin este endpoint): sin adjuntos
export const fetchChatAttachmentsConfig = async (
    groupId: number,
    digitalTwinId: number,
    { accessToken, refreshToken, authDispatch }: ApiAuth,
): Promise<ChatAttachmentsConfig | null> => {
    try {
        const response = await getAxiosInstance(refreshToken, authDispatch).get(
            `${baseUrl()}/chat_attachment_enabled/${groupId}/${digitalTwinId}`,
            axiosAuth(accessToken) as any,
        );
        const data = response.data as Partial<ChatAttachmentsConfig>;
        return {
            enabled: data.enabled === true,
            maxSize: typeof data.maxSize === "number" ? data.maxSize : 10 * 1024 * 1024,
            textMaxSize: typeof data.textMaxSize === "number" ? data.textMaxSize : 1024 * 1024,
            types: Array.isArray(data.types) ? data.types : ["image/jpeg", "image/png", "image/webp"],
            retentionDays: typeof data.retentionDays === "number" ? data.retentionDays : 30,
        };
    } catch {
        return null;
    }
};

const errorMessage = (error: unknown, fallback: string): string => {
    const data = (error as AxiosError<{ message?: string }>)?.response?.data;
    return (data && typeof data === "object" && typeof data.message === "string" && data.message) || fallback;
};

export const uploadChatAttachment = async (
    groupId: number,
    digitalTwinId: number,
    file: Blob,
    name: string,
    { accessToken, refreshToken, authDispatch }: ApiAuth,
): Promise<ChatAttachmentRef> => {
    const form = new FormData();
    form.append("file", file, name);
    try {
        const response = await getAxiosInstance(refreshToken, authDispatch).post(
            `${baseUrl()}/chat_attachment_upload/${groupId}/${digitalTwinId}`,
            form,
            // multipart, como las demás subidas de la plataforma: con el application/json por defecto axios
            // convierte el FormData en JSON y multer no recibe el archivo (400 "No file was received")
            axiosAuth(accessToken, "multipart/form-data") as any,
        );
        const [ref] = sanitizeAttachments([response.data]) ?? [];
        if (!ref) throw new Error("Invalid answer of the server");
        return ref;
    } catch (error) {
        if ((error as AxiosError)?.response?.status === 401) axiosErrorHandler(error as AxiosError, authDispatch);
        throw new Error(errorMessage(error, "The file could not be uploaded"));
    }
};

// caché de las imágenes ya descargadas (URL blob:), por gemelo y archivo
const imageUrlCache = new Map<string, Promise<string>>();

export const chatAttachmentImageUrl = (
    groupId: number,
    digitalTwinId: number,
    file: string,
    { accessToken, refreshToken, authDispatch }: ApiAuth,
): Promise<string> => {
    const cacheKey = `${groupId}/${digitalTwinId}/${file}`;
    const cached = imageUrlCache.get(cacheKey);
    if (cached) return cached;
    const request = getAxiosInstance(refreshToken, authDispatch)
        .get(`${baseUrl()}/chat_attachment_file/${groupId}/${digitalTwinId}/${file}`, {
            ...(axiosAuth(accessToken) as any),
            responseType: "blob",
        })
        .then((response) => URL.createObjectURL(response.data as Blob));
    imageUrlCache.set(cacheKey, request);
    // si falla, se puede volver a pedir
    request.catch(() => imageUrlCache.delete(cacheKey));
    return request;
};

// Una foto decodificada ya girada según su etiqueta EXIF de orientación. Los móviles guardan los píxeles en
// apaisado con una etiqueta que dice cómo girarla: un <img> la respeta (image-orientation: from-image, por defecto
// en los navegadores actuales); createImageBitmap sin opciones la ignora en algunos (Chrome de Android), y la
// foto acabaría tumbada para siempre en el JPEG nuevo.
const decodeUpright = async (file: File): Promise<{ source: CanvasImageSource; width: number; height: number; done: () => void }> => {
    const url = URL.createObjectURL(file);
    try {
        const img = new Image();
        img.decoding = "async";
        img.src = url;
        await img.decode();
        if (!img.naturalWidth || !img.naturalHeight) throw new Error("empty image");
        return { source: img, width: img.naturalWidth, height: img.naturalHeight, done: () => URL.revokeObjectURL(url) };
    } catch {
        URL.revokeObjectURL(url);
        const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
        return { source: bitmap, width: bitmap.width, height: bitmap.height, done: () => bitmap.close() };
    }
};

// Reduce una foto a ATTACHMENT_MAX_SIDE px de lado mayor, en JPEG y derecha (las de los móviles pesan varios MB y
// vienen giradas por EXIF). Siempre se vuelve a dibujar, también si ya es pequeña, para que la orientación quede
// en los píxeles: el modelo de imagen no lee la etiqueta EXIF. Si no se puede (formato que el navegador no
// decodifica), devuelve el archivo tal cual: el servidor decide.
export const prepareAttachmentImage = async (file: File): Promise<{ blob: Blob; name: string }> => {
    const baseName = (file.name || "image").replace(/\.[^.]*$/, "");
    try {
        const image = await decodeUpright(file);
        const scale = Math.min(1, ATTACHMENT_MAX_SIDE / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) {
            image.done();
            throw new Error("no canvas");
        }
        // fondo blanco: las PNG con transparencia (capturas) no quedan negras en JPEG
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(image.source, 0, 0, canvas.width, canvas.height);
        image.done();
        const blob = await new Promise<Blob | null>((resolve) =>
            canvas.toBlob(resolve, "image/jpeg", ATTACHMENT_JPEG_QUALITY),
        );
        if (!blob) throw new Error("no blob");
        return { blob, name: `${baseName}.jpg` };
    } catch {
        return { blob: file, name: file.name || "image" };
    }
};

export const makeChatAttachmentService = (
    groupId: number,
    digitalTwinId: number,
    config: ChatAttachmentsConfig,
    auth: ApiAuth,
): ChatAttachmentService => ({
    enabled: config.enabled,
    maxSize: config.maxSize,
    textMaxSize: config.textMaxSize,
    types: config.types,
    retentionDays: config.retentionDays,
    upload: (file, name) => uploadChatAttachment(groupId, digitalTwinId, file, name, auth),
    imageUrl: (file) => chatAttachmentImageUrl(groupId, digitalTwinId, file, auth),
});
