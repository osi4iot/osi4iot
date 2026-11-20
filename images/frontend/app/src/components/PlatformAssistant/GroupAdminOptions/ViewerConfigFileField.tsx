// The viewer configuration file of the create and edit forms of a digital twin: the layout of the Viewer for the
// twin's group and the twin's lighting, as the Viewer downloads them; a .json, or a .zip that also brings the
// images of its Picture panels. When the form is saved it replaces the group's layout and the twin's lighting, and
// the zip's images are uploaded to the twin (they replace those with the same name).
import { FC, useRef } from "react";
import styled from "styled-components";
import { toast } from "react-toastify";
import { FormSection } from "../../Tools/FormTools";
import FileDrop from "../../Tools/FileDrop";
import formatDateString from "../../../tools/formatDate";
import {
    ParsedViewerConfig,
    describeViewerConfig,
    parseViewerConfig,
} from "../DigitalTwin3DViewer/Workspace/viewerConfig";
import { PackageImage, describePackageImages, isZipName, readViewerPackage } from "../DigitalTwin3DViewer/Workspace/viewerPackage";

export interface ViewerConfigFile {
    fileName: string;
    lastModified: string;
    config: ParsedViewerConfig;
    // a .zip: its images, and what was left out of it
    images?: PackageImage[];
    ignored?: string[];
}

// null (and a message) when the file is not a valid configuration
export const readViewerConfigFile = async (file: File): Promise<ViewerConfigFile | null> => {
    let text: string;
    let images: PackageImage[] | undefined;
    let ignored: string[] | undefined;
    if (isZipName(file.name)) {
        const read = readViewerPackage(new Uint8Array(await file.arrayBuffer()));
        if ("error" in read) {
            toast.error(`${file.name}: ${read.error}`);
            return null;
        }
        ({ configText: text, images, ignored } = read);
    } else {
        text = await file.text();
    }
    const result = parseViewerConfig(text);
    if ("error" in result) {
        toast.error(`${file.name}: ${result.error}`);
        return null;
    }
    return { fileName: file.name, lastModified: formatDateString(file.lastModified as any), config: result, images, ignored };
};

const Container = styled.div`
    border: 2px solid #2c3235;
    border-radius: 10px;
    padding: 10px;
    width: 100%;
    margin-bottom: 20px;
`;

const Field = styled.div`
    margin: 10px 0;
    display: flex;
    flex-direction: column;
    width: 100%;

    & label {
        font-size: 12px;
        margin: 0 0 5px 3px;
    }
    & div {
        font-size: 14px;
        background-color: #0c0d0f;
        border: 2px solid #2c3235;
        padding: 5px;
        margin-left: 2px;
        color: white;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
`;

const Note = styled.p<{ $warn?: boolean }>`
    margin: 4px 2px 8px 3px;
    font-size: 12px;
    line-height: 1.4;
    color: ${({ $warn }) => ($warn ? "#f2cc0c" : "#c9c9c9")};
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
`;

interface ViewerConfigFileFieldProps {
    value: ViewerConfigFile | null;
    onChange: (value: ViewerConfigFile | null) => void;
    // the twin already has a viewer configuration (edit form): the file replaces it
    replaces?: boolean;
}

const ViewerConfigFileField: FC<ViewerConfigFileFieldProps> = ({ value, onChange, replaces = false }) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const load = async (file: File | undefined) => {
        if (!file) return;
        const read = await readViewerConfigFile(file);
        if (read) onChange(read);
    };
    return (
        <FormSection title="Viewer configuration">
            <Container>
                <Note>
                    The layout of the Viewer (slides, panels, time) for the twin&apos;s group and the twin&apos;s
                    lighting, as the Viewer downloads them (Configuration › Download): a .json, or a .zip with the
                    images of its Picture panels.
                    {replaces ? " Saving the form replaces the current ones." : ""}
                </Note>
                <Field>
                    <label>File name</label>
                    <div>{value?.fileName ?? "-"}</div>
                </Field>
                <Field>
                    <label>Content</label>
                    <div>
                        {value
                            ? [describeViewerConfig(value.config), value.images ? describePackageImages(value.images) : ""].filter(Boolean).join(" · ")
                            : "-"}
                    </div>
                </Field>
                {value?.images && value.images.length > 0 && (
                    <Note>Its images are uploaded to the twin when the form is saved (they replace those with the same name).</Note>
                )}
                {[...(value?.config.warnings ?? []), ...(value?.ignored ?? []).map((what) => `Left out of the zip: ${what}.`)].map((warning) => (
                    <Note key={warning} $warn>
                        {warning}
                    </Note>
                ))}
                <Buttons>
                    <FileButton type="button" onClick={() => onChange(null)}>
                        Clear
                    </FileButton>
                    <FileButton type="button" onClick={() => inputRef.current?.click()}>
                        Select local file
                    </FileButton>
                </Buttons>
                <input
                    ref={inputRef}
                    type="file"
                    accept=".json,application/json,.zip,application/zip"
                    hidden
                    aria-label="Viewer configuration file"
                    onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        void load(file);
                    }}
                />
                <FileDrop hintStyle={{ margin: "-30px 0 6px 0" }} accept={[".json", ".zip"]} onFiles={(files) => void load(files[0])} />
            </Container>
        </FormSection>
    );
};

export default ViewerConfigFileField;
