// Selección de archivos locales de los formularios de crear y editar (gltf, resultados FEM, pipeline, svg,
// geojson, modelos de ML...).
//
// Igual que useFilePicker de "use-file-picker" (misma configuración y mismo resultado), pero el selector se abre
// en la carpeta del último archivo elegido: los archivos de un componente suelen estar juntos y, con el
// <input type="file"> de siempre, el diálogo empezaba cada vez desde la carpeta inicial. La primera búsqueda de
// cada formulario empieza donde el navegador decida; las siguientes, en la carpeta de la anterior. Al cerrar el
// formulario (no queda ningún selector montado) se olvida esa carpeta.
//
// Usa el File System Access API (showOpenFilePicker con startIn), que tienen Chrome, Edge y Opera. En Firefox y
// Safari se usa el selector de siempre (allí es el propio navegador el que recuerda la última carpeta). Algunos
// diálogos del sistema ignoran la carpeta inicial (Linux con el portal de escritorio): para esos casos los
// archivos también se pueden soltar en su recuadro (FileDrop) o cargar todos a la vez (MultiFileLoader), con
// loadFiles, que los carga igual que si se hubieran elegido en el diálogo.
import { useCallback, useEffect, useState } from "react";
import { useFilePicker as useLibraryFilePicker } from "use-file-picker";

type ReadAs = "Text" | "DataURL" | "ArrayBuffer" | "BinaryString";

interface PickerType {
    description?: string;
    accept: Record<string, string[]>;
}

interface FileHandle {
    getFile(): Promise<File>;
}

type ShowOpenFilePicker = (options: {
    multiple?: boolean;
    types?: PickerType[];
    excludeAcceptAllOption?: boolean;
    startIn?: FileHandle;
}) => Promise<FileHandle[]>;

// carpeta del último archivo elegido en el formulario abierto
let mountedPickers = 0;
let lastHandle: FileHandle | null = null;

const nativePicker = (): ShowOpenFilePicker | null => {
    if (typeof window === "undefined") return null;
    const picker = (window as unknown as { showOpenFilePicker?: ShowOpenFilePicker }).showOpenFilePicker;
    // dentro de un iframe de otro origen el API existe pero falla: se comprueba al usarlo
    return typeof picker === "function" ? picker.bind(window) : null;
};

// ".yml, .yaml" / [".json", ".bin"] / "image/svg+xml" -> tipos de showOpenFilePicker
export const pickerTypes = (accept: string | string[] | undefined): PickerType[] | undefined => {
    const items = (Array.isArray(accept) ? accept : (accept ?? "").split(","))
        .map((item) => item.trim())
        .filter((item) => item !== "" && item !== "*");
    if (items.length === 0) return undefined;
    const extensions = items.filter((item) => /^\.[A-Za-z0-9+_-]{1,16}$/.test(item));
    const mimeTypes = items.filter((item) => item.includes("/"));
    const types: Record<string, string[]> = {};
    for (const mime of mimeTypes) types[mime] = [];
    if (extensions.length) types["application/octet-stream"] = extensions;
    if (Object.keys(types).length === 0) return undefined;
    return [{ description: extensions.join(", ") || mimeTypes.join(", "), accept: types }];
};

const readFile = (file: File, readAs: ReadAs) =>
    new Promise<string | ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string | ArrayBuffer);
        reader.onerror = () => reject(reader.error);
        if (readAs === "DataURL") reader.readAsDataURL(file);
        else if (readAs === "ArrayBuffer") reader.readAsArrayBuffer(file);
        else if (readAs === "BinaryString") reader.readAsBinaryString(file);
        else reader.readAsText(file);
    });

// Elige archivos con el diálogo (en la carpeta del último elegido si el sistema lo permite) sin leerlos: para
// MultiFileLoader. Devuelve [] si se cierra sin elegir.
export const pickLocalFiles = async (accept: string | string[], multiple = true): Promise<File[]> => {
    const showOpenFilePicker = nativePicker();
    if (showOpenFilePicker) {
        try {
            const handles = await showOpenFilePicker({
                multiple,
                types: pickerTypes(accept),
                excludeAcceptAllOption: false,
                ...(lastHandle ? { startIn: lastHandle } : {}),
            });
            if (handles.length) lastHandle = handles[0];
            return await Promise.all(handles.map((handle) => handle.getFile()));
        } catch (error) {
            if ((error as Error).name === "AbortError") return [];
            console.warn("showOpenFilePicker is not available here, using the file input:", error);
        }
    }
    return new Promise<File[]>((resolve) => {
        const input = document.createElement("input");
        input.type = "file";
        input.multiple = multiple;
        input.accept = Array.isArray(accept) ? accept.join(",") : accept;
        input.style.display = "none";
        document.body.appendChild(input);
        input.addEventListener("change", () => {
            resolve(Array.from(input.files ?? []));
            input.remove();
        });
        input.addEventListener("cancel", () => {
            resolve([]);
            input.remove();
        });
        input.click();
    });
};

interface PickedState {
    plainFiles: File[];
    filesContent: unknown[];
    loading: boolean;
}

export const useFilePicker = ((config: Parameters<typeof useLibraryFilePicker>[0] = {}) => {
    const library = useLibraryFilePicker(config);
    const [picked, setPicked] = useState<PickedState | null>(null);
    const options = config as { accept?: string | string[]; multiple?: boolean; readAs?: ReadAs };
    const { accept, multiple = false, readAs = "Text" } = options;
    const acceptKey = Array.isArray(accept) ? accept.join(",") : (accept ?? "");

    useEffect(() => {
        mountedPickers += 1;
        return () => {
            mountedPickers -= 1;
            if (mountedPickers === 0) lastHandle = null;
        };
    }, []);

    const { openFilePicker: openLibraryPicker, clear: clearLibrary } = library;

    const openFilePicker = useCallback(async () => {
        const showOpenFilePicker = nativePicker();
        if (!showOpenFilePicker) {
            setPicked(null);
            openLibraryPicker();
            return;
        }
        let handles: FileHandle[];
        try {
            handles = await showOpenFilePicker({
                multiple,
                types: pickerTypes(acceptKey),
                excludeAcceptAllOption: false,
                ...(lastHandle ? { startIn: lastHandle } : {}),
            });
        } catch (error) {
            if ((error as Error).name === "AbortError") return; // cerrado sin elegir
            console.warn("showOpenFilePicker is not available here, using the file input:", error);
            setPicked(null);
            openLibraryPicker();
            return;
        }
        if (handles.length === 0) return;
        lastHandle = handles[0];
        clearLibrary();
        setPicked({ plainFiles: [], filesContent: [], loading: true });
        try {
            const files = await Promise.all(handles.map((handle) => handle.getFile()));
            const contents = await Promise.all(
                files.map(async (file) =>
                    Object.assign(file, { content: await readFile(file, readAs), path: file.name }),
                ),
            );
            setPicked({ plainFiles: files, filesContent: contents, loading: false });
        } catch (error) {
            console.error("The selected file could not be read:", error);
            setPicked({ plainFiles: [], filesContent: [], loading: false });
        }
    }, [acceptKey, multiple, readAs, openLibraryPicker, clearLibrary]);

    const clear = useCallback(() => {
        setPicked(null);
        clearLibrary();
    }, [clearLibrary]);

    // carga archivos soltados en el formulario como si se hubieran elegido en el diálogo
    const loadFiles = useCallback(
        async (files: File[]) => {
            const selected = multiple ? files : files.slice(0, 1);
            if (selected.length === 0) return;
            clearLibrary();
            setPicked({ plainFiles: [], filesContent: [], loading: true });
            try {
                const contents = await Promise.all(
                    selected.map(async (file) =>
                        Object.assign(file, { content: await readFile(file, readAs), path: file.name }),
                    ),
                );
                setPicked({ plainFiles: selected, filesContent: contents, loading: false });
            } catch (error) {
                console.error("The file could not be read:", error);
                setPicked({ plainFiles: [], filesContent: [], loading: false });
            }
        },
        [multiple, readAs, clearLibrary],
    );

    if (picked) {
        return { ...library, ...picked, errors: [], openFilePicker, clear, loadFiles };
    }
    return { ...library, openFilePicker, clear, loadFiles };
}) as <C extends Parameters<typeof useLibraryFilePicker>[0]>(
    config?: C,
) => ReturnType<typeof useLibraryFilePicker<unknown, NonNullable<C>>> & { loadFiles: (files: File[]) => Promise<void> };
