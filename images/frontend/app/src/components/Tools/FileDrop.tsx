// Soltar archivos en el recuadro de un archivo de un formulario (gltf, resultados FEM, pipeline, svg, geojson...).
//
// Se coloca dentro del recuadro, debajo de sus botones: muestra "or drop a file here" y convierte en zona de
// soltar a su elemento padre (el recuadro), que se resalta en azul al pasar un archivo por encima. Al soltarlo
// se comprueba su extensión: si es del tipo esperado se entrega a onFiles (normalmente loadFiles de
// useFilePicker, que lo carga como si se hubiera elegido en el diálogo); si no, el recuadro se pone en rojo y
// avisa de qué tipo espera.
//
// Permite cargar los archivos desde el gestor de archivos, abierto en su carpeta, sin pasar por el diálogo del
// sistema (que en algunos sistemas siempre empieza desde la carpeta inicial).
import { CSSProperties, FC, useEffect, useRef, useState } from "react";
import styled from "styled-components";
import { toast } from "react-toastify";
import { FaFileImport, FaExclamationTriangle } from "react-icons/fa";
import { asIcon } from "../../tools/icons";
import { acceptLabel, matchesAccept } from "../../tools/fileTypes";

const FaFileImportIcon = asIcon(FaFileImport);
const FaExclamationTriangleIcon = asIcon(FaExclamationTriangle);

const Hint = styled.div`
    width: 100%;
    margin: -12px 0 6px 0;
    text-align: center;
    font-size: 12px;
    color: #8a8f96;
    background: none !important;
    border: none !important;
    padding: 0 !important;
`;

const Overlay = styled.div<{ $state: "over" | "bad" }>`
    position: absolute;
    inset: 0;
    z-index: 5;
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 12px;
    text-align: center;
    font-size: 15px;
    pointer-events: none;
    background: rgba(20, 22, 25, 0.82) !important;
    border: none !important;
    color: ${({ $state }) => ($state === "bad" ? "#ff8a76" : "#9cc3ff")} !important;

    svg {
        width: 28px;
        height: 28px;
    }

    small {
        font-size: 12px;
        color: #c9c9c9;
    }
`;

interface FileDropProps {
    // extensiones aceptadas: ".gltf", ".yml, .yaml", [".json", ".bin"]
    accept: string | string[];
    multiple?: boolean;
    onFiles: (files: File[]) => void;
    disabled?: boolean;
    hintStyle?: CSSProperties;
}

const OUTLINE = { over: "2px dashed #3d82f0", bad: "2px dashed #e0533d" };

const FileDrop: FC<FileDropProps> = ({ accept, multiple = false, onFiles, disabled = false, hintStyle }) => {
    const ref = useRef<HTMLDivElement>(null);
    const [state, setState] = useState<"idle" | "over" | "bad">("idle");
    const [message, setMessage] = useState("");
    const onFilesRef = useRef(onFiles);
    onFilesRef.current = onFiles;
    const acceptKey = Array.isArray(accept) ? accept.join(",") : accept;

    useEffect(() => {
        const box = ref.current?.parentElement;
        if (!box || disabled) return;
        if (getComputedStyle(box).position === "static") box.style.position = "relative";
        let depth = 0;
        let badTimer: ReturnType<typeof setTimeout> | null = null;
        const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
        const setOutline = (value: string) => {
            box.style.outline = value;
            box.style.outlineOffset = value ? "-2px" : "";
        };

        const onDragEnter = (e: DragEvent) => {
            if (!hasFiles(e)) return;
            e.preventDefault();
            depth += 1;
            if (badTimer) clearTimeout(badTimer);
            setState("over");
            setOutline(OUTLINE.over);
        };
        const onDragOver = (e: DragEvent) => {
            if (!hasFiles(e)) return;
            e.preventDefault();
            if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
        };
        const onDragLeave = (e: DragEvent) => {
            if (!hasFiles(e)) return;
            depth = Math.max(0, depth - 1);
            if (depth === 0) {
                setState("idle");
                setOutline("");
            }
        };
        const onDrop = (e: DragEvent) => {
            if (!hasFiles(e)) return;
            e.preventDefault();
            e.stopPropagation();
            depth = 0;
            const files = Array.from(e.dataTransfer?.files ?? []);
            const valid = files.filter((file) => matchesAccept(file, acceptKey));
            const wrong = files.filter((file) => !matchesAccept(file, acceptKey));
            if (valid.length === 0) {
                const text = `${wrong.map((f) => f.name).join(", ")}: this box expects ${acceptLabel(acceptKey)}`;
                setMessage(text);
                setState("bad");
                setOutline(OUTLINE.bad);
                toast.warning(text);
                badTimer = setTimeout(() => {
                    setState("idle");
                    setOutline("");
                }, 2500);
                return;
            }
            if (wrong.length) toast.warning(`Ignored (not ${acceptLabel(acceptKey)}): ${wrong.map((f) => f.name).join(", ")}`);
            if (!multiple && valid.length > 1) toast.info(`Only one file is used here: ${valid[0].name}`);
            setState("idle");
            setOutline("");
            onFilesRef.current(multiple ? valid : valid.slice(0, 1));
        };

        box.addEventListener("dragenter", onDragEnter);
        box.addEventListener("dragover", onDragOver);
        box.addEventListener("dragleave", onDragLeave);
        box.addEventListener("drop", onDrop);
        return () => {
            if (badTimer) clearTimeout(badTimer);
            setOutline("");
            box.removeEventListener("dragenter", onDragEnter);
            box.removeEventListener("dragover", onDragOver);
            box.removeEventListener("dragleave", onDragLeave);
            box.removeEventListener("drop", onDrop);
        };
    }, [acceptKey, multiple, disabled]);

    if (disabled) return null;
    return (
        <Hint ref={ref} style={hintStyle}>
            or drop {multiple ? "files" : "a file"} here
            {state === "over" && (
                <Overlay $state="over">
                    <FaFileImportIcon />
                    Drop to load {multiple ? "the files" : "the file"}
                    <small>{acceptLabel(acceptKey)}</small>
                </Overlay>
            )}
            {state === "bad" && (
                <Overlay $state="bad">
                    <FaExclamationTriangleIcon />
                    {message}
                </Overlay>
            )}
        </Hint>
    );
};

export default FileDrop;
