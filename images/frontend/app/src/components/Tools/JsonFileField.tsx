import { FC, useEffect, useState } from "react";
import styled from "styled-components";
import { useFormikContext } from "formik";
import { toast } from "react-toastify";
import YAML from "yaml";
import formatDateString from "../../tools/formatDate";
import { FieldErrorScroller, scrollbarStyle, FormSection } from "./FormTools";
import { useFilePicker } from "../../tools/useFilePicker";
import FileDrop from "./FileDrop";

// A form field whose value is a JSON document (asset topic and sensor
// references, a digital twin's simulation format...), set by choosing a
// file instead of typing it: JSON, or YAML (converted to JSON). The
// formik value stays the JSON text, indented, so validation and submit
// work as before. The content can be looked at, downloaded (to use as a
// template) or reset to its starting value.
//
// With clearValue it works like the other file fields of the forms (gltf,
// FEM results, pipeline): "Clear" and "Select local file". With
// fileNameField and lastModifiedField, the name and last modification date of
// the chosen file are formik fields too, so they are saved with the rest
// ("-" when there is no file).

const Container = styled.div`
    border: 2px solid #2c3235;
    border-radius: 10px;
    padding: 10px;
    width: 100%;
    margin-bottom: 20px;
`;

const FieldContainer = styled.div`
    margin: 10px 0;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    align-items: flex-start;
    width: 100%;

    & label {
        font-size: 12px;
        margin: 0 0 5px 3px;
        width: 100%;
    }

    & div {
        font-size: 14px;
        background-color: #0c0d0f;
        border: 2px solid #2c3235;
        padding: 5px;
        margin-left: 2px;
        color: white;
        width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
`;

const ButtonsContainer = styled.div`
    display: flex;
    flex-direction: row;
    flex-wrap: wrap;
    justify-content: center;
    align-items: center;
    gap: 12px 10px;
    width: 100%;
    margin: 10px 0 15px 0;
    padding: 10px 10px 18px 10px;
    background-color: #202226;
    border-radius: 8px;
    box-sizing: border-box;
`;

const FileButton = styled.button`
    background-color: #3274d9;
    padding: 5px 8px;
    margin: 0;
    color: white;
    border: 1px solid #2c3235;
    border-radius: 10px;
    outline: none;
    cursor: pointer;
    box-shadow: 0 5px #173b70;
    font-size: 14px;
    flex: 1 1 0;
    min-width: 90px;
    white-space: nowrap;

    &:hover {
        background-color: #2461c0;
    }

    &:active {
        background-color: #2461c0;
        box-shadow: 0 2px #173b70;
        transform: translateY(4px);
    }
`;

// Same look as the other file fields of the forms (gltf, FEM results, pipeline)
const SelectFileButtonsContainer = styled.div`
    display: flex;
    flex-direction: row;
    justify-content: center;
    align-items: center;
    gap: 20px;
    width: 100%;
    margin: 10px 0 25px 0;
    padding: 10px 10px 18px 10px;
    background-color: #202226;
    border-radius: 8px;
    box-sizing: border-box;
`;

const SelectFileButton = styled(FileButton)`
    flex: 0 1 40%;
    width: 40%;
    padding: 5px 10px;
`;

const Summary = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 13px;
    color: #c9c9c9;
    margin: 0 2px 5px 3px;
`;

const ToggleContent = styled.span`
    color: #3274d9;
    cursor: pointer;
    white-space: nowrap;

    &:hover {
        text-decoration: underline;
    }
`;

const Content = styled.pre`
    max-height: 300px;
    overflow: auto;
    margin: 0 0 5px 2px;
    padding: 8px;
    background-color: #0c0d0f;
    border: 2px solid #2c3235;
    color: #d4d4d4;
    font-size: 12px;
    white-space: pre;
    ${scrollbarStyle}
`;

// What the document holds, in a few words: "3 entries", "5 fields".
const describe = (text: string): string => {
    try {
        const value = JSON.parse(text);
        if (Array.isArray(value)) return value.length === 1 ? "1 entry" : `${value.length} entries`;
        if (value !== null && typeof value === "object") {
            const n = Object.keys(value).length;
            return n === 1 ? "1 field" : `${n} fields`;
        }
        return "a single value";
    } catch {
        return "not valid JSON";
    }
};

// JSON first; YAML for .yaml/.yml files, or when the text is not JSON.
const parseDocument = (fileName: string, text: string): unknown => {
    const isYaml = /\.(ya?ml)$/i.test(fileName);
    if (!isYaml) {
        try {
            return JSON.parse(text);
        } catch (jsonError) {
            try {
                return YAML.parse(text);
            } catch {
                throw jsonError;
            }
        }
    }
    return YAML.parse(text);
};

// Reads a JSON/YAML file for one of these fields: its JSON text (indented), name and date, or null (with a
// message) when it is not valid. Also used to load the file from elsewhere (MultiFileLoader).
export const loadJsonDocument = async (
    file: File,
    check?: (value: unknown) => string | null,
    content?: string,
): Promise<{ text: string; fileName: string; lastModified: string } | null> => {
    let text: string;
    try {
        text = content ?? (await file.text());
    } catch (error) {
        toast.error(`${file.name} could not be read: ${(error as Error).message}`);
        return null;
    }
    let value: unknown;
    try {
        value = parseDocument(file.name, text);
    } catch (error) {
        toast.error(`${file.name}: it is neither valid JSON nor YAML (${(error as Error).message})`);
        return null;
    }
    const problem = check ? check(value) : null;
    if (problem) {
        toast.error(`${file.name}: ${problem}`);
        return null;
    }
    return {
        text: JSON.stringify(value, null, 4),
        fileName: file.name,
        lastModified: formatDateString(new Date(file.lastModified).toISOString()),
    };
};

// Checks for the usual documents.
export const mustBeArray = (value: unknown): string | null =>
    Array.isArray(value) ? null : "it must be a list (a JSON array)";

export const mustBeObject = (value: unknown): string | null =>
    value !== null && typeof value === "object" && !Array.isArray(value) ? null : "it must be a JSON object";

interface JsonFileFieldProps {
    // The formik field holding the JSON text.
    name: string;
    label: string;
    // What the field starts with ("Default", "Current"…), shown as its
    // file name until a file is chosen.
    initialSourceLabel: string;
    // The value "Reset" goes back to; no Reset button without it.
    resetValue?: string;
    // The name of the file Download saves.
    downloadFileName: string;
    // Checks the document's structure when a file is chosen: a message
    // when it is wrong.
    check?: (value: unknown) => string | null;
    // "Clear" (to this value) and "Select local file" instead of Reset,
    // Download and Select file.
    clearValue?: string;
    // formik fields with the chosen file's name and last modification date
    fileNameField?: string;
    lastModifiedField?: string;
}

const JsonFileField: FC<JsonFileFieldProps> = ({
    name,
    label,
    initialSourceLabel,
    resetValue,
    downloadFileName,
    check,
    clearValue,
    fileNameField,
    lastModifiedField,
}) => {
    const formik = useFormikContext<Record<string, unknown>>();
    const [localSource, setLocalSource] = useState({ fileName: initialSourceLabel, lastModified: "-" });
    const [showContent, setShowContent] = useState(false);
    const text = String(formik.values[name] ?? "");
    // the file it came from: in formik fields when given, otherwise only shown
    const source = {
        fileName: fileNameField ? String(formik.values[fileNameField] || "-") : localSource.fileName,
        lastModified: lastModifiedField ? String(formik.values[lastModifiedField] || "-") : localSource.lastModified,
    };
    const setSource = (newSource: { fileName: string; lastModified: string }) => {
        // sin validar: cada validación de formik usa los valores de este render y desharía la del contenido
        if (fileNameField) void formik.setFieldValue(fileNameField, newSource.fileName, false);
        if (lastModifiedField) void formik.setFieldValue(lastModifiedField, newSource.lastModified, false);
        setLocalSource(newSource);
    };

    const setText = (newText: string) => {
        formik.setFieldValue(name, newText);
        formik.setFieldTouched(name, true, false);
    };

    // the file selector opens in the folder of the form's last chosen file (tools/useFilePicker)
    const { openFilePicker, filesContent, plainFiles, loading, clear, loadFiles } = useFilePicker({
        readAs: "Text",
        multiple: false,
        accept: [".json", ".yaml", ".yml"],
    });

    useEffect(() => {
        if (loading || filesContent.length === 0 || plainFiles.length === 0) return;
        const file = plainFiles[0];
        const content = String(filesContent[0].content);
        clear();
        void loadJsonDocument(file, check, content).then((doc) => {
            if (!doc) return;
            setText(doc.text);
            setSource({ fileName: doc.fileName, lastModified: doc.lastModified });
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loading, filesContent, plainFiles]);

    const download = () => {
        const blob = new Blob([text], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = downloadFileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    };

    const reset = () => {
        if (resetValue === undefined) return;
        setText(resetValue);
        setSource({ fileName: initialSourceLabel, lastModified: "-" });
    };

    const clearFile = () => {
        if (clearValue === undefined) return;
        setText(clearValue);
        setSource({ fileName: "-", lastModified: "-" });
    };

    return (
        <FormSection title={label}>
            <Container>
                <FieldContainer>
                    <label>File name</label>
                    <div title={source.fileName}>{source.fileName}</div>
                </FieldContainer>
                <FieldContainer>
                    <label>Last modification date</label>
                    <div>{source.lastModified}</div>
                </FieldContainer>
                <Summary>
                    <span>Content: {describe(text)}</span>
                    <ToggleContent onClick={() => setShowContent((shown) => !shown)}>
                        {showContent ? "Hide content" : "Show content"}
                    </ToggleContent>
                </Summary>
                {showContent && <Content>{text}</Content>}
                <FieldErrorScroller name={name} />
                {clearValue !== undefined ? (
                    <SelectFileButtonsContainer>
                        <SelectFileButton type="button" onClick={clearFile}>
                            Clear
                        </SelectFileButton>
                        <SelectFileButton type="button" onClick={() => void openFilePicker()}>
                            Select local file
                        </SelectFileButton>
                    </SelectFileButtonsContainer>
                ) : (
                    <ButtonsContainer>
                        {resetValue !== undefined && (
                            <FileButton type="button" onClick={reset}>
                                Reset
                            </FileButton>
                        )}
                        <FileButton type="button" onClick={download} title="Save the content to use it as a template">
                            Download
                        </FileButton>
                        <FileButton type="button" onClick={() => void openFilePicker()}>
                            Select file
                        </FileButton>
                    </ButtonsContainer>
                )}
                <FileDrop accept={[".json", ".yaml", ".yml"]} onFiles={(files) => void loadFiles(files)} />
            </Container>
        </FormSection>
    );
};

export default JsonFileField;
