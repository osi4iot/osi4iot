// "Viewer data" in the create and edit forms of a digital twin (viewerData.ts): files to load once the form is saved —
// any part (3D model, FEM results, simulator format, viewer configuration, pipeline), several at once, or the .zip
// of all of them that the Viewer downloads (Viewer data › Download all). Each part can also be loaded later from the
// Viewer.
import { FC, useRef, useState } from "react";
import styled from "styled-components";
import { toast } from "react-toastify";
import { X } from "lucide-react";
import { FormSection, scrollbarStyle } from "../../Tools/FormTools";
import FileDrop from "../../Tools/FileDrop";
import {
    DataFile,
    PART_EFFECTS,
    PART_LABELS,
    ViewerDataSet,
    readViewerDataFiles,
} from "../DigitalTwin3DViewer/Workspace/viewerData";

const Container = styled.div`
    border: 2px solid #2c3235;
    border-radius: 10px;
    padding: 10px;
    width: 100%;
    margin-bottom: 20px;
`;

const Note = styled.p<{ $warn?: boolean }>`
    margin: 4px 2px 8px 3px;
    font-size: 12px;
    line-height: 1.4;
    color: ${({ $warn }) => ($warn ? "#f2cc0c" : "#c9c9c9")};
`;

const List = styled.ul`
    list-style: none;
    margin: 6px 0;
    padding: 0;
    max-height: 220px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 6px;
    ${scrollbarStyle}

    li {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 30px;
        gap: 8px;
        align-items: center;
        padding: 6px 8px;
        background: #0c0d0f;
        border: 2px solid #2c3235;
        border-radius: 6px;
        font-size: 13px;
    }
    .file {
        color: #9aa1aa;
        font-size: 12px;
        word-break: break-all;
    }
    button {
        width: 28px;
        height: 28px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: 1px solid #2c3137;
        border-radius: 6px;
        background: transparent;
        color: #c7cbd1;
        cursor: pointer;
    }
    svg {
        width: 14px;
        height: 14px;
    }
`;

const Buttons = styled.div`
    display: flex;
    justify-content: center;
    gap: 20px;
    width: 100%;
    margin: 10px 0 25px 0;
    padding: 10px 10px 18px 10px;
    background-color: #202226;
    border-radius: 8px;
    box-sizing: border-box;
`;

const FileButton = styled.button`
    flex: 0 1 40%;
    background-color: #3274d9;
    padding: 5px 10px;
    color: white;
    border: 1px solid #2c3235;
    border-radius: 10px;
    cursor: pointer;
    box-shadow: 0 5px #173b70;
    font-size: 14px;
    white-space: nowrap;

    &:hover {
        background-color: #2461c0;
    }
    &:active {
        box-shadow: 0 2px #173b70;
        transform: translateY(4px);
    }
    &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
`;

const ACCEPT = [".zip", ".glb", ".gltf", ".json", ".yml", ".yaml"];

// what the files bring, or null and a message when they could not be read
// looseModel: a 3D model and FEM results taken alone (the create form: for the first slide); the edit form takes
// them only in the .zip of all the viewer data (each slide's), a loose one is loaded in its 3D Model panel
export const readViewerDataFileList = async (files: File[], looseModel = true): Promise<ViewerDataSet | null> => {
    try {
        // a File is a Blob: nothing is read into memory here (the .zip is read entry by entry)
        const dataFiles: DataFile[] = files.map((file) => ({ name: file.name, data: file, lastModified: file.lastModified }));
        return await readViewerDataFiles(dataFiles, { looseModel });
    } catch (error) {
        toast.error(`The files could not be read: ${error instanceof Error ? error.message : String(error)}`);
        return null;
    }
};

interface ViewerDataFileFieldProps {
    value: ViewerDataSet | null;
    onChange: (value: ViewerDataSet | null) => void;
    // the edit form: what it loads replaces what the twin has
    replaces?: boolean;
}

const ViewerDataFileField: FC<ViewerDataFileFieldProps> = ({ value, onChange, replaces = false }) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const [reading, setReading] = useState(false);
    const load = async (files: File[]) => {
        if (files.length === 0) return;
        setReading(true);
        const set = await readViewerDataFileList(files, !replaces);
        setReading(false);
        if (!set) return;
        if (set.items.length === 0) toast.warning("Nothing to load in these files");
        onChange(set.items.length > 0 || set.ignored.length > 0 ? set : null);
    };
    const remove = (index: number) => {
        if (!value) return;
        const items = value.items.filter((_, i) => i !== index);
        onChange(items.length > 0 ? { ...value, items } : null);
    };
    return (
        <FormSection title="Viewer data (optional)">
            <Container>
                <Note>
                    The 3D model, FEM results, simulator format, viewer configuration and pipeline of the twin: one file, several, or
                    the .zip of all of them (Viewer › Viewer data › Download all). They are loaded when the form is saved
                    {replaces ? " and replace what the twin has" : ""}. Each part can also be loaded later from the Viewer.
                </Note>
                {value && value.items.length > 0 && (
                    <List aria-label="Viewer data to load">
                        {value.items.map((item, i) => (
                            <li key={`${item.part}-${item.file.name}-${i}`}>
                                <div>
                                    <div>{PART_LABELS[item.part]}</div>
                                    <div className="file">
                                        {item.file.name} · {item.summary}
                                    </div>
                                    {replaces && <div className="file">{PART_EFFECTS[item.part]}</div>}
                                </div>
                                <button type="button" aria-label={`Do not load ${item.file.name}`} onClick={() => remove(i)}>
                                    <X aria-hidden="true" />
                                </button>
                            </li>
                        ))}
                    </List>
                )}
                {(value?.ignored ?? []).map((reason) => (
                    <Note key={reason} $warn>
                        Left out: {reason}
                    </Note>
                ))}
                <Buttons>
                    <FileButton type="button" onClick={() => onChange(null)} disabled={!value}>
                        Clear
                    </FileButton>
                    <FileButton type="button" onClick={() => inputRef.current?.click()} disabled={reading}>
                        {reading ? "Reading…" : "Select local files"}
                    </FileButton>
                </Buttons>
                <input
                    ref={inputRef}
                    type="file"
                    multiple
                    accept={ACCEPT.join(",")}
                    hidden
                    aria-label="Viewer data files"
                    onChange={(e) => {
                        const files = Array.from(e.target.files ?? []);
                        e.target.value = "";
                        void load(files);
                    }}
                />
                <FileDrop hintStyle={{ margin: "-30px 0 6px 0" }} accept={ACCEPT} multiple onFiles={(files) => void load(files)} />
            </Container>
        </FormSection>
    );
};

export default ViewerDataFileField;
