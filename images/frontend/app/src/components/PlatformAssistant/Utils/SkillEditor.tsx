import { FC, useMemo, useState } from "react";
import styled from "styled-components";
import { toast } from "react-toastify";
import { AxiosError } from "axios";
import CodeMirror from "@uiw/react-codemirror";
import { json } from "@codemirror/lang-json";
import { oneDark } from "@codemirror/theme-one-dark";
import { useAuthState, useAuthDispatch } from "../../../contexts/authContext";
import { axiosAuth } from "../../../tools/tools";
import { getAxiosInstance } from "../../../tools/axiosIntance";
import axiosErrorHandler from "../../../tools/axiosErrorHandler";
import { CodeMirrorWrapper } from "../../Tools/CodeMirrorWrapper";
import {
    SKILL_FILE_EXTENSIONS,
    SKILL_NAME_MAX_LENGTH,
    SkillFiles,
    SkillScope,
    downloadBlob,
    fileExtension,
    formatSkillSize,
    isValidSkillName,
    newSkillTemplate,
    readSkillMdHeader,
    setSkillMdName,
    skillUrl,
    writeZip,
} from "./skills";

// Creates or edits a skill: its name (only when it is new), its SKILL.md
// and the other files the agent may read. Saved whole (PUT): admin_api
// checks it and answers with what is wrong.
//
// readOnly: only to view it (a built-in skill, or a platform skill seen
// from a group), with Duplicate to make an editable copy.

const Container = styled.div`
    display: flex;
    flex-direction: column;
    gap: 12px;
    width: calc(100% - 40px);
    margin: 20px;
    color: white;
    font-size: 14px;
`;

const Header = styled.div`
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px 20px;
`;

const Title = styled.span`
    font-size: 18px;
    font-weight: 600;
`;

const Body = styled.div`
    display: grid;
    grid-template-columns: minmax(180px, 240px) 1fr;
    gap: 15px;
    min-height: 420px;
`;

const FileList = styled.div`
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 8px;
    border: 1px solid #2c3235;
    border-radius: 5px;
    background-color: #141619;
`;

const FileItem = styled.div<{ selected: boolean }>`
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 6px;
    padding: 4px 6px;
    border-radius: 4px;
    cursor: pointer;
    background-color: ${(p) => (p.selected ? "#3274d9" : "transparent")};
    word-break: break-all;

    &:hover {
        background-color: ${(p) => (p.selected ? "#3274d9" : "#202226")};
    }
`;

const FileSize = styled.span`
    color: #c9c9c9;
    font-size: 11px;
    white-space: nowrap;
`;

const RemoveFile = styled.span`
    color: #c9c9c9;
    padding: 0 4px;

    &:hover {
        color: #f2495c;
    }
`;

const TextInput = styled.input`
    background-color: #0c0d0f;
    color: white;
    border: 1px solid #2c3235;
    border-radius: 5px;
    padding: 6px 10px;
    font-size: 14px;
    outline: none;

    &:focus {
        border: 1px solid #3274d9;
    }
`;

const Button = styled.button<{ primary?: boolean }>`
    background-color: ${(props) => (props.primary ? "#3274d9" : "#202226")};
    color: white;
    border: 1px solid ${(props) => (props.primary ? "#3274d9" : "#2c3235")};
    border-radius: 5px;
    padding: 6px 16px;
    font-size: 14px;
    cursor: pointer;

    &:hover {
        border: 1px solid #5a95f5;
    }

    &:disabled {
        opacity: 0.5;
        cursor: default;
    }
`;

const Buttons = styled.div`
    display: flex;
    justify-content: flex-end;
    gap: 10px;
`;

const Hint = styled.span`
    color: #c9c9c9;
    font-size: 12px;
`;

const Warning = styled.span`
    color: #f2cc0c;
`;

const AddFileRow = styled.div`
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: 8px;
`;

interface SkillEditorProps {
    scope: SkillScope;
    groupId?: number;
    // Absent: a new skill (suggestedName: its starting name, e.g. a duplicate's).
    name?: string;
    suggestedName?: string;
    files?: SkillFiles;
    existingNames: string[];
    readOnly?: boolean;
    builtin?: boolean;
    onDuplicate?: () => void;
    onClose: (saved: boolean) => void;
}

const SkillEditor: FC<SkillEditorProps> = ({
    scope,
    groupId,
    name: initialName,
    suggestedName,
    files: initialFiles,
    existingNames,
    readOnly = false,
    builtin = false,
    onDuplicate,
    onClose,
}) => {
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();
    const isNew = initialName === undefined;
    const [name, setName] = useState(initialName ?? suggestedName ?? "");
    const [files, setFiles] = useState<SkillFiles>(initialFiles ?? newSkillTemplate(suggestedName || "my-skill"));
    const [selected, setSelected] = useState("SKILL.md");
    const [newPath, setNewPath] = useState("");
    const [saving, setSaving] = useState(false);

    const header = useMemo(() => readSkillMdHeader(files["SKILL.md"] || ""), [files]);

    // The name in the frontmatter of a new skill follows the name typed
    // while it is the same (or still the template's).
    const changeName = (value: string) => {
        const followed = header.name === (name || "my-skill") || header.name === "my-skill";
        setName(value);
        if (isNew && followed) {
            setFiles((f) => ({ ...f, "SKILL.md": setSkillMdName(f["SKILL.md"] || "", value || "my-skill") }));
        }
    };
    const nameProblem = !name
        ? "Give the skill a name"
        : !isValidSkillName(name)
          ? `Lowercase letters, digits and hyphens, at most ${SKILL_NAME_MAX_LENGTH} characters`
          : isNew && existingNames.includes(name)
            ? "There is already a skill with this name"
            : "";
    const headerProblem = readOnly
        ? ""
        : header.error ||
          (header.name !== name ? `The frontmatter's name must be '${name}'` : "") ||
          (!header.description
              ? "The frontmatter needs a description: it is what makes the agent choose the skill"
              : "");

    const paths = useMemo(
        () => Object.keys(files).sort((a, b) => (a === "SKILL.md" ? -1 : b === "SKILL.md" ? 1 : a.localeCompare(b))),
        [files],
    );

    const addFile = () => {
        const path = newPath.trim().replace(/^\/+/, "");
        if (!path) return;
        if (path in files) {
            toast.error(`${path} already exists`);
            return;
        }
        if (!SKILL_FILE_EXTENSIONS.includes(fileExtension(path))) {
            toast.error(`Use a text file: ${SKILL_FILE_EXTENSIONS.join(", ")}`);
            return;
        }
        setFiles((f) => ({ ...f, [path]: "" }));
        setSelected(path);
        setNewPath("");
    };

    const removeFile = (path: string) => {
        setFiles((f) => {
            const { [path]: _removed, ...rest } = f;
            return rest;
        });
        if (selected === path) setSelected("SKILL.md");
    };

    const save = () => {
        if (nameProblem) {
            toast.error(nameProblem);
            return;
        }
        setSaving(true);
        getAxiosInstance(refreshToken, authDispatch)
            .put(skillUrl(scope, name, groupId), { files }, axiosAuth(accessToken))
            .then((response) => {
                toast.success(response.data.message);
                setSaving(false);
                onClose(true);
            })
            .catch((error: AxiosError) => {
                setSaving(false);
                axiosErrorHandler(error, authDispatch);
            });
    };

    const size = (path: string) => new TextEncoder().encode(files[path] || "").length;

    return (
        <Container>
            <Header>
                <Title>
                    {isNew ? "New skill" : `Skill ${name}`} ({scope === "platform" ? "platform" : "group"})
                    {readOnly && " — read-only"}
                </Title>
                {readOnly && (
                    <Hint>
                        {builtin
                            ? "A built-in skill of the platform: it is updated with the platform and cannot be changed."
                            : "A platform skill: it is managed in Platform admin."}{" "}
                        Duplicate it to adapt it.
                    </Hint>
                )}
                {isNew && (
                    <TextInput
                        value={name}
                        maxLength={SKILL_NAME_MAX_LENGTH}
                        placeholder="skill-name"
                        onChange={(e) => changeName(e.target.value.trim())}
                    />
                )}
                {!readOnly && nameProblem && <Warning>{nameProblem}</Warning>}
                {!nameProblem && headerProblem && <Warning>{headerProblem}</Warning>}
            </Header>
            <Hint>
                The agent only sees the name and the description until it loads the skill: write in the description when
                to use it. In the frontmatter, requires_mcp lists the MCP servers the skill needs (e.g. [fem_results]).
            </Hint>
            <Body>
                <FileList>
                    {paths.map((path) => (
                        <FileItem key={path} selected={path === selected} onClick={() => setSelected(path)}>
                            <span>{path}</span>
                            <span>
                                <FileSize>{formatSkillSize(size(path))}</FileSize>
                                {path !== "SKILL.md" && !readOnly && (
                                    <RemoveFile
                                        title={`Remove ${path}`}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            removeFile(path);
                                        }}
                                    >
                                        ✕
                                    </RemoveFile>
                                )}
                            </span>
                        </FileItem>
                    ))}
                    {!readOnly && (
                        <AddFileRow>
                            <TextInput
                                value={newPath}
                                placeholder="references/checklist.md"
                                onChange={(e) => setNewPath(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") addFile();
                                }}
                            />
                            <Button type="button" onClick={addFile}>
                                Add file
                            </Button>
                        </AddFileRow>
                    )}
                </FileList>
                <CodeMirrorWrapper fontSize="14px" style={{ marginTop: 0 }}>
                    <CodeMirror
                        key={selected}
                        value={files[selected] ?? ""}
                        height="calc(100vh - 380px)"
                        minHeight="400px"
                        theme={oneDark}
                        editable={!readOnly}
                        readOnly={readOnly}
                        extensions={fileExtension(selected) === ".json" ? [json()] : []}
                        onChange={(value) => setFiles((f) => ({ ...f, [selected]: value }))}
                    />
                </CodeMirrorWrapper>
            </Body>
            <Buttons>
                <Button type="button" onClick={() => onClose(false)} disabled={saving}>
                    {readOnly ? "Close" : "Cancel"}
                </Button>
                <Button
                    type="button"
                    onClick={() => downloadBlob(writeZip(name || "skill", files), `${name || "skill"}.zip`)}
                    disabled={saving}
                >
                    Download .zip
                </Button>
                {readOnly ? (
                    onDuplicate && (
                        <Button type="button" primary onClick={onDuplicate}>
                            Duplicate
                        </Button>
                    )
                ) : (
                    <Button type="button" primary onClick={save} disabled={saving || !!nameProblem}>
                        {saving ? "Saving…" : "Save"}
                    </Button>
                )}
            </Buttons>
        </Container>
    );
};

export default SkillEditor;
