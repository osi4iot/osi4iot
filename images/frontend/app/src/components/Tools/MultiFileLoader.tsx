// Cargar de una vez todos los archivos de un formulario (gltf, resultados FEM, pipeline, formato de simulación...).
//
// "Select local files" abre el diálogo una sola vez (Ctrl+clic para elegir varios) y también se pueden soltar
// aquí todos juntos. Cada archivo va al recuadro de su tipo; si hay varios recuadros para el mismo tipo (dos
// .json), decide su contenido (test). Lo que no encaja en ningún recuadro queda como "Not used" y se puede
// asignar a mano. Cada recuadro sigue teniendo sus botones y se le puede soltar otro archivo.
import { FC, useState } from "react";
import styled from "styled-components";
import { FaFileImport, FaCheckCircle, FaQuestionCircle, FaExclamationCircle } from "react-icons/fa";
import { asIcon } from "../../tools/icons";
import { acceptList, matchesAccept } from "../../tools/fileTypes";
import { pickLocalFiles } from "../../tools/useFilePicker";
import FileDrop from "./FileDrop";

const FaFileImportIcon = asIcon(FaFileImport);
const FaCheckCircleIcon = asIcon(FaCheckCircle);
const FaQuestionCircleIcon = asIcon(FaQuestionCircle);
const FaExclamationCircleIcon = asIcon(FaExclamationCircle);

export interface FileTarget {
    key: string;
    // nombre del recuadro ("Gltf data file", "FEM results file"...)
    label: string;
    accept: string | string[];
    // ¿es para este recuadro? (por su contenido): para repartir archivos del mismo tipo entre varios recuadros
    test?: (text: string, file: File) => boolean;
    load: (file: File) => void;
    // false: el recuadro no está en el formulario ahora (p. ej. según el tipo de gemelo)
    available?: boolean;
    unavailableNote?: string;
}

interface Assignment {
    file: File;
    key: string | null;
    note?: string;
}

// En la rejilla de los formularios (ControlsContainer) ocupa toda la fila, tras los campos sencillos y antes de
// los recuadros de cada archivo
const Box = styled.div`
    grid-column: 1 / -1;
    order: 1;
    border: 2px solid #2c3235;
    border-radius: 10px;
    padding: 10px 12px;
    width: 100%;
    margin-bottom: 20px;
`;

const Top = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    font-size: 12px;
    color: #9aa0a6;
    margin-bottom: 14px;
`;

const LoadButton = styled.button`
    background-color: #3274d9;
    padding: 5px 12px;
    margin: 0;
    color: white;
    border: 1px solid #2c3235;
    border-radius: 10px;
    cursor: pointer;
    box-shadow: 0 5px #173b70;
    font-size: 14px;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    white-space: nowrap;
    flex-shrink: 0;

    &:hover {
        background-color: #2461c0;
    }

    &:active {
        box-shadow: 0 2px #173b70;
        transform: translateY(3px);
    }
`;

const Report = styled.div`
    margin: 0 0 14px 0;
    max-width: 640px;
    border: 1px solid #3a3f45;
    border-radius: 8px;
    background: #17181b;
    overflow: hidden;
`;

const ReportHead = styled.div`
    padding: 7px 10px;
    font-size: 13px;
    background: #1d1f23;
    border-bottom: 1px solid #2c3235;
`;

// nombre y recuadro en la misma línea si caben; si no, el recuadro debajo del nombre
const Line = styled.div<{ $kind: "ok" | "warn" | "ask" }>`
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    column-gap: 8px;
    row-gap: 4px;
    padding: 7px 10px;
    font-size: 13px;

    & + & {
        border-top: 1px solid #23262b;
    }

    svg {
        flex-shrink: 0;
        color: ${({ $kind }) => ($kind === "ok" ? "#5fd38d" : $kind === "warn" ? "#e2b13c" : "#9cc3ff")};
    }

    b {
        flex: 1 1 200px;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-weight: 500;
    }

    select,
    span {
        margin-left: auto;
        max-width: 100%;
        font-size: 12px;
    }

    select {
        background: #0c0d0f;
        color: #eee;
        border: 1px solid #2c3235;
        border-radius: 4px;
        padding: 2px 4px;
    }

    span {
        color: #9aa0a6;
    }

    small {
        flex-basis: 100%;
        padding-left: 24px;
        color: #9aa0a6;
        font-size: 11px;
    }
`;

interface MultiFileLoaderProps {
    targets: FileTarget[];
    description?: string;
}

const MultiFileLoader: FC<MultiFileLoaderProps> = ({ targets, description }) => {
    const [assignments, setAssignments] = useState<Assignment[]>([]);
    const accept = Array.from(new Set(targets.flatMap((target) => acceptList(target.accept))));
    const targetOf = (key: string | null) => targets.find((target) => target.key === key);

    const assign = async (files: File[]) => {
        const used = new Set<string>();
        const result: Assignment[] = [];
        for (const file of files) {
            const byType = targets.filter((target) => matchesAccept(file, target.accept));
            if (byType.length === 0) {
                result.push({ file, key: null, note: "No box for this type of file" });
                continue;
            }
            const available = byType.filter((target) => target.available !== false && !used.has(target.key));
            let candidates = available;
            // el contenido decide (y evita, p. ej., llevar unos resultados FEM al formato de simulación)
            if (candidates.some((target) => target.test)) {
                let text = "";
                try {
                    text = await file.text();
                } catch {
                    text = "";
                }
                candidates = candidates.filter((target) => !target.test || target.test(text, file));
                if (candidates.length === 0 && available.length > 0) {
                    result.push({
                        file,
                        key: null,
                        note: `Not recognised as ${available.map((target) => target.label).join(" or ")}: choose a box`,
                    });
                    continue;
                }
            }
            if (candidates.length === 1) {
                used.add(candidates[0].key);
                result.push({ file, key: candidates[0].key });
            } else if (candidates.length === 0) {
                const unavailable = byType.find((target) => target.available === false);
                const taken = byType.find((target) => used.has(target.key));
                result.push({
                    file,
                    key: null,
                    note: unavailable?.unavailableNote ?? (taken ? `${taken.label} already gets another file` : undefined),
                });
            } else {
                result.push({ file, key: null, note: "Could be for several boxes: choose one" });
            }
        }
        setAssignments(result);
        for (const { file, key } of result) {
            if (key) targetOf(key)?.load(file);
        }
    };

    const choose = (index: number, key: string) => {
        setAssignments((previous) =>
            previous.map((assignment, i) => {
                if (i === index) return { ...assignment, key: key || null, note: undefined };
                if (key && assignment.key === key) return { ...assignment, key: null, note: "Replaced" };
                return assignment;
            }),
        );
        const file = assignments[index]?.file;
        if (key && file) targetOf(key)?.load(file);
    };

    const loaded = assignments.filter((assignment) => assignment.key).length;

    return (
        <Box>
            <Top>
                <span>
                    {description ??
                        "All the files of this form in one go (Ctrl+click in the dialog), or drop them here."}
                </span>
                <LoadButton
                    type="button"
                    onClick={() =>
                        void pickLocalFiles(accept, true).then((files) => {
                            if (files.length) void assign(files);
                        })
                    }
                >
                    <FaFileImportIcon /> Select local files
                </LoadButton>
            </Top>
            {assignments.length > 0 && (
                <Report role="status">
                    <ReportHead>
                        {loaded} of {assignments.length} file{assignments.length === 1 ? "" : "s"} loaded
                    </ReportHead>
                    {assignments.map((assignment, index) => {
                        const options = targets.filter(
                            (target) => target.available !== false && matchesAccept(assignment.file, target.accept),
                        );
                        const kind = assignment.key ? "ok" : options.length ? "ask" : "warn";
                        return (
                            <Line key={`${assignment.file.name}-${index}`} $kind={kind}>
                                {kind === "ok" ? (
                                    <FaCheckCircleIcon />
                                ) : kind === "ask" ? (
                                    <FaQuestionCircleIcon />
                                ) : (
                                    <FaExclamationCircleIcon />
                                )}
                                <b title={assignment.file.name}>{assignment.file.name}</b>
                                {options.length > 0 ? (
                                    <select
                                        value={assignment.key ?? ""}
                                        onChange={(e) => choose(index, e.target.value)}
                                        aria-label={`Box for ${assignment.file.name}`}
                                    >
                                        <option value="">Not used</option>
                                        {options.map((target) => (
                                            <option key={target.key} value={target.key}>
                                                → {target.label}
                                            </option>
                                        ))}
                                    </select>
                                ) : (
                                    <span>Not used</span>
                                )}
                                {assignment.note && <small>{assignment.note}</small>}
                            </Line>
                        );
                    })}
                </Report>
            )}
            <FileDrop multiple accept={accept} onFiles={(files) => void assign(files)} hintStyle={{ margin: "0 0 2px 0" }} />
        </Box>
    );
};

export default MultiFileLoader;
