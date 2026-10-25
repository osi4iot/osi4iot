import { FC, useRef, useState, ChangeEvent } from "react";
import styled from "styled-components";
import { useFormikContext } from "formik";
import { toast } from "react-toastify";
import YAML from "yaml";
import formatDateString from "../../tools/formatDate";
import { FieldErrorScroller, scrollbarStyle } from "./FormTools";

// A form field whose value is a JSON document (asset topic and sensor
// references, a digital twin's simulation format...), set by choosing a
// file instead of typing it: JSON, or YAML (converted to JSON). The
// formik value stays the JSON text, indented, so validation and submit
// work as before. The content can be looked at, downloaded (to use as a
// template) or reset to its starting value.

const Title = styled.div`
    margin-bottom: 5px;
`;

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

const HiddenFileInput = styled.input`
    display: none;
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
}

const JsonFileField: FC<JsonFileFieldProps> = ({
    name,
    label,
    initialSourceLabel,
    resetValue,
    downloadFileName,
    check,
}) => {
    const formik = useFormikContext<Record<string, unknown>>();
    const inputRef = useRef<HTMLInputElement>(null);
    const [source, setSource] = useState({ fileName: initialSourceLabel, lastModified: "-" });
    const [showContent, setShowContent] = useState(false);
    const text = String(formik.values[name] ?? "");

    const setText = (newText: string) => {
        formik.setFieldValue(name, newText);
        formik.setFieldTouched(name, true, false);
    };

    const onFileSelected = (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        // Allow choosing the same file again later.
        e.target.value = "";
        if (!file) return;
        file.text()
            .then((content) => {
                let value: unknown;
                try {
                    value = parseDocument(file.name, content);
                } catch (error) {
                    toast.error(`${file.name}: it is neither valid JSON nor YAML (${(error as Error).message})`);
                    return;
                }
                const problem = check ? check(value) : null;
                if (problem) {
                    toast.error(`${file.name}: ${problem}`);
                    return;
                }
                setText(JSON.stringify(value, null, 4));
                setSource({
                    fileName: file.name,
                    lastModified: formatDateString(new Date(file.lastModified).toISOString()),
                });
            })
            .catch((error: Error) => toast.error(`${file.name} could not be read: ${error.message}`));
    };

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

    return (
        <>
            <Title>{label}</Title>
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
                <ButtonsContainer>
                    {resetValue !== undefined && (
                        <FileButton type="button" onClick={reset}>
                            Reset
                        </FileButton>
                    )}
                    <FileButton type="button" onClick={download} title="Save the content to use it as a template">
                        Download
                    </FileButton>
                    <FileButton type="button" onClick={() => inputRef.current?.click()}>
                        Select file
                    </FileButton>
                </ButtonsContainer>
                <HiddenFileInput
                    ref={inputRef}
                    type="file"
                    accept=".json,.yaml,.yml,application/json"
                    onChange={onFileSelected}
                />
            </Container>
        </>
    );
};

export default JsonFileField;
