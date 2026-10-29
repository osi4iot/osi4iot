// Recuadros de archivo de los formularios de crear y editar gemelo digital, para cargarlos todos de una vez
// (MultiFileLoader): pipeline (.yml), modelo 3D (.gltf/.glb), resultados FEM (.json con "metadata") y formato de
// simulación (.json/.yaml con campos label, units, minValue...).
import YAML from "yaml";
import { FileTarget } from "../../Tools/MultiFileLoader";
import { digitalTwinFormatValidation } from "../../../tools/tools";

interface FilePickerTarget {
    clear: () => void;
    loadFiles: (files: File[]) => Promise<void>;
}

const parseDocument = (text: string): unknown => {
    try {
        return JSON.parse(text);
    } catch {
        try {
            return YAML.parse(text);
        } catch {
            return null;
        }
    }
};

const isObject = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === "object" && !Array.isArray(value);

// resultados FEM: objeto con "metadata" (resultFields...)
export const isFemResultsDocument = (text: string) => {
    const value = parseDocument(text);
    return isObject(value) && isObject(value.metadata);
};

// formato de simulación: objeto cuyos campos tienen label, units, minValue, maxValue...
export const isSimulationFormatDocument = (text: string) => {
    const value = parseDocument(text);
    return isObject(value) && Object.keys(value).length > 0 && !("metadata" in value) && digitalTwinFormatValidation(value);
};

// pipeline: YAML con una lista "nodes"
export const isPipelineDocument = (text: string) => {
    const value = parseDocument(text);
    return isObject(value) && Array.isArray(value.nodes);
};

export const digitalTwinFileTargets = ({
    digitalTwinType,
    pipeline,
    clearPipeline,
    gltf,
    clearGltf,
    femResults,
    clearFemResults,
    loadSimulationFormat,
}: {
    digitalTwinType: string;
    pipeline: FilePickerTarget;
    clearPipeline: () => void;
    gltf: FilePickerTarget;
    clearGltf: () => void;
    femResults: FilePickerTarget;
    clearFemResults: () => void;
    loadSimulationFormat: (file: File) => void;
}): FileTarget[] => {
    const is3D = digitalTwinType === "Gltf 3D model" || digitalTwinType === "Glb 3D model";
    const need3D = 'Choose the type "Gltf 3D model" or "Glb 3D model" first';
    return [
        {
            key: "pipeline",
            label: "Pipeline",
            accept: [".yml", ".yaml"],
            test: isPipelineDocument,
            load: (file) => {
                clearPipeline();
                void pipeline.loadFiles([file]);
            },
        },
        {
            key: "gltf",
            label: digitalTwinType === "Glb 3D model" ? "Glb data file" : "Gltf data file",
            accept: digitalTwinType === "Glb 3D model" ? [".glb"] : [".gltf"],
            available: is3D,
            unavailableNote: need3D,
            load: (file) => {
                clearGltf();
                void gltf.loadFiles([file]);
            },
        },
        {
            key: "femResults",
            label: "FEM results file",
            accept: [".json"],
            available: is3D,
            unavailableNote: need3D,
            test: isFemResultsDocument,
            load: (file) => {
                clearFemResults();
                void femResults.loadFiles([file]);
            },
        },
        {
            key: "simulationFormat",
            label: "Digital twin simulation format",
            accept: [".json", ".yaml", ".yml"],
            available: is3D,
            unavailableNote: need3D,
            test: isSimulationFormatDocument,
            load: loadSimulationFormat,
        },
    ];
};
