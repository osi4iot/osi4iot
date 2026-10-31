import { FC, useCallback, useEffect, useMemo, useRef, useState, ChangeEvent } from "react";
import styled from "styled-components";
import { toast } from "react-toastify";
import { AxiosError, AxiosResponse } from "axios";
import { useAuthState, useAuthDispatch } from "../../../contexts/authContext";
import { axiosAuth } from "../../../tools/tools";
import { getAxiosInstance } from "../../../tools/axiosIntance";
import axiosErrorHandler from "../../../tools/axiosErrorHandler";
import TableWithPagination from "./TableWithPagination";
import { Column } from "./platformTable";
import Loader from "../../Tools/Loader";
import { IGroupManaged } from "../TableColumns/groupsManagedColumns";
import { Create_SKILLS_COLUMNS, ISkillRow, toSkillRows } from "../TableColumns/skillsColumns";
import SkillEditor from "./SkillEditor";
import {
    ISkillSummary,
    SKILL_ZIP_MAX_SIZE,
    SkillFiles,
    SkillScope,
    downloadBlob,
    freeSkillName,
    groupAvailableSkillsUrl,
    groupPlatformSkillUrl,
    isValidSkillName,
    readSkillMdHeader,
    readZip,
    setSkillMdName,
    skillUrl,
    skillsFromZip,
    skillsListUrl,
    writeZip,
} from "./skills";

// The skills of the AI agents of a scope: the platform's (platform
// admin) or a group's (group admin, choosing the group). Each AiAgent
// node chooses which ones its agent has, in its Tools tab.
//
// A skill is created in the editor, or uploaded: a .zip with one skill
// (SKILL.md at its top) or several (a folder per skill), or a lone
// SKILL.md. Uploading a skill that exists replaces it.
//
// The built-in skills of the platform are read-only: they are viewed and
// duplicated (an editable copy with another name). A group's view also
// lists the platform skills, read-only, to view and duplicate them into
// the group.

const Container = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 100%;
`;

const HeaderContainer = styled.div`
    display: flex;
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
    gap: 15px 30px;
    width: calc(100% - 40px);
    margin: 20px 20px 0 20px;
    color: white;
    font-size: 14px;
`;

const GroupSelectorLabel = styled.label`
    display: flex;
    align-items: center;
    gap: 10px;
`;

const GroupSelect = styled.select`
    background-color: #0c0d0f;
    color: white;
    border: 1px solid #2c3235;
    border-radius: 5px;
    padding: 6px 10px;
    font-size: 14px;
    outline: none;
    cursor: pointer;

    &:hover,
    &:focus {
        border: 1px solid #3274d9;
    }
`;

const InfoText = styled.span`
    color: #c9c9c9;
`;

const Button = styled.button<{ primary?: boolean; danger?: boolean }>`
    background-color: ${(p) => (p.danger ? "#e02f44" : p.primary ? "#3274d9" : "#202226")};
    color: white;
    border: 1px solid ${(p) => (p.danger ? "#e02f44" : p.primary ? "#3274d9" : "#2c3235")};
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

const Panel = styled.div<{ warning?: boolean }>`
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: calc(100% - 40px);
    margin: 15px 20px 0 20px;
    padding: 12px 15px;
    border: 1px solid ${(p) => (p.warning ? "#f2cc0c" : "#2c3235")};
    border-radius: 5px;
    background-color: #141619;
    color: white;
    font-size: 14px;
`;

const PanelButtons = styled.div`
    display: flex;
    justify-content: flex-end;
    gap: 10px;
`;

const NoGroupsMessage = styled.div`
    color: white;
    margin-top: 40px;
    font-size: 16px;
`;

const ErrorText = styled.span`
    color: #f2495c;
`;

const SectionTitle = styled.div`
    width: calc(100% - 40px);
    margin: 25px 20px 0 20px;
    color: white;
    font-size: 16px;
    font-weight: 600;
`;

interface ISkillUse {
    digitalTwinId: number;
    digitalTwinUid: string;
    groupId: number;
    nodeName: string;
}

interface IPendingSkill {
    name: string;
    files: SkillFiles;
    replaces: boolean;
    problem: string;
}

type EditorState = {
    name?: string;
    suggestedName?: string;
    files?: SkillFiles;
    readOnly?: boolean;
    builtin?: boolean;
    // To duplicate it from the read-only view.
    duplicate?: () => void;
} | null;

interface SkillsContainerProps {
    scope: SkillScope;
    // Group scope: the groups the user manages, to choose one.
    groupsManaged?: IGroupManaged[];
}

const SkillsContainer: FC<SkillsContainerProps> = ({ scope, groupsManaged = [] }) => {
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();
    const [groupId, setGroupId] = useState<number | undefined>(
        scope === "group" && groupsManaged.length ? groupsManaged[0].id : undefined,
    );
    const [skills, setSkills] = useState<ISkillSummary[]>([]);
    // In a group: the platform's skills, read-only.
    const [platformSkills, setPlatformSkills] = useState<ISkillSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [editor, setEditor] = useState<EditorState>(null);
    const [pending, setPending] = useState<IPendingSkill[]>([]);
    const [uploading, setUploading] = useState(false);
    const [inUse, setInUse] = useState<{ name: string; usedBy: ISkillUse[] } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const ready = scope === "platform" || groupId !== undefined;
    const axios = useCallback(() => getAxiosInstance(refreshToken, authDispatch), [refreshToken, authDispatch]);

    const fetchSkills = useCallback(() => {
        if (!ready) return;
        setLoading(true);
        axios()
            .get(skillsListUrl(scope, groupId), axiosAuth(accessToken))
            .then((response: AxiosResponse<ISkillSummary[]>) => setSkills(response.data))
            .catch((error: AxiosError) => {
                setSkills([]);
                axiosErrorHandler(error, authDispatch);
            })
            .finally(() => setLoading(false));
        if (scope === "group" && groupId !== undefined) {
            axios()
                .get(groupAvailableSkillsUrl(groupId), axiosAuth(accessToken))
                .then((response: AxiosResponse<{ skills: ISkillSummary[] }>) =>
                    setPlatformSkills(response.data.skills.filter((s) => s.scope === "platform")),
                )
                .catch(() => setPlatformSkills([]));
        }
    }, [axios, accessToken, authDispatch, scope, groupId, ready]);

    useEffect(() => {
        setEditor(null);
        setPending([]);
        setInUse(null);
        fetchSkills();
    }, [fetchSkills]);

    // fromPlatform: a platform skill seen from a group.
    const getSkillFiles = useCallback(
        (name: string, fromPlatform = false): Promise<SkillFiles> =>
            axios()
                .get(
                    fromPlatform && groupId !== undefined
                        ? groupPlatformSkillUrl(groupId, name)
                        : skillUrl(scope, name, groupId),
                    axiosAuth(accessToken),
                )
                .then((response: AxiosResponse<{ files: SkillFiles }>) => response.data.files),
        [axios, accessToken, scope, groupId],
    );

    // Names a new skill of this scope cannot take: its own, and in a group
    // the platform's too (the agent knows skills by name).
    const takenNames = useMemo(
        () => [...skills.map((s) => s.name), ...(scope === "group" ? platformSkills.map((s) => s.name) : [])],
        [skills, platformSkills, scope],
    );

    // Opens an editable copy, named <name>-custom (or -2, -3...), as a new
    // skill of this scope.
    const duplicateSkill = useCallback(
        (name: string, fromPlatform = false) =>
            getSkillFiles(name, fromPlatform)
                .then((files) => {
                    const newName = freeSkillName(`${name}-custom`, takenNames);
                    setEditor({
                        suggestedName: newName,
                        files: { ...files, "SKILL.md": setSkillMdName(files["SKILL.md"] || "", newName) },
                    });
                })
                .catch((error: AxiosError) => axiosErrorHandler(error, authDispatch)),
        [getSkillFiles, takenNames, authDispatch],
    );

    const openSkill = useCallback(
        (skill: ISkillSummary | undefined, name: string, fromPlatform = false) => {
            const readOnly = fromPlatform || !!skill?.builtin;
            getSkillFiles(name, fromPlatform)
                .then((files) =>
                    setEditor({
                        name,
                        files,
                        readOnly,
                        builtin: !!skill?.builtin,
                        duplicate: readOnly ? () => void duplicateSkill(name, fromPlatform) : undefined,
                    }),
                )
                .catch((error: AxiosError) => axiosErrorHandler(error, authDispatch));
        },
        [getSkillFiles, duplicateSkill, authDispatch],
    );

    const deleteSkill = useCallback(
        (name: string, force: boolean, done: () => void) => {
            axios()
                .delete(`${skillUrl(scope, name, groupId)}${force ? "?force=true" : ""}`, axiosAuth(accessToken))
                .then((response: AxiosResponse<{ message: string }>) => {
                    toast.success(response.data.message);
                    setInUse(null);
                    fetchSkills();
                })
                .catch((error: AxiosError) => {
                    const data = error.response?.data as { usedBy?: ISkillUse[] } | undefined;
                    if (error.response?.status === 409 && data?.usedBy) {
                        setInUse({ name, usedBy: data.usedBy });
                    } else {
                        axiosErrorHandler(error, authDispatch);
                    }
                })
                .finally(done);
        },
        [axios, accessToken, authDispatch, scope, groupId, fetchSkills],
    );

    const columnsTable = useMemo(
        () =>
            Create_SKILLS_COLUMNS({
                edit: (name) =>
                    openSkill(
                        skills.find((s) => s.name === name),
                        name,
                    ),
                duplicate: (name) => void duplicateSkill(name),
                download: (name) =>
                    getSkillFiles(name)
                        .then((files) => downloadBlob(writeZip(name, files), `${name}.zip`))
                        .catch((error: AxiosError) => axiosErrorHandler(error, authDispatch)),
                remove: (name, done) => deleteSkill(name, false, done),
            }),
        [getSkillFiles, deleteSkill, openSkill, duplicateSkill, skills, authDispatch],
    );

    const platformColumnsTable = useMemo(
        () =>
            Create_SKILLS_COLUMNS(
                {
                    edit: (name) =>
                        openSkill(
                            platformSkills.find((s) => s.name === name),
                            name,
                            true,
                        ),
                    duplicate: (name) => void duplicateSkill(name, true),
                    download: (name) =>
                        getSkillFiles(name, true)
                            .then((files) => downloadBlob(writeZip(name, files), `${name}.zip`))
                            .catch((error: AxiosError) => axiosErrorHandler(error, authDispatch)),
                    remove: (_name, done) => done(),
                },
                true,
            ),
        [getSkillFiles, openSkill, duplicateSkill, platformSkills, authDispatch],
    );
    const platformRows: ISkillRow[] = useMemo(() => toSkillRows(platformSkills), [platformSkills]);

    const rows: ISkillRow[] = useMemo(() => toSkillRows(skills), [skills]);
    const existingNames = takenNames;

    // ---- upload ----

    const chooseFiles = async (files: File[]) => {
        const found: IPendingSkill[] = [];
        for (const file of files) {
            try {
                if (file.size > SKILL_ZIP_MAX_SIZE) throw new Error("larger than 10 MB");
                if (file.name.toLowerCase().endsWith(".zip")) {
                    for (const s of skillsFromZip(await readZip(file))) {
                        found.push({ name: s.name, files: s.files, replaces: false, problem: "" });
                    }
                } else if (file.name === "SKILL.md") {
                    const content = await file.text();
                    const { name, error } = readSkillMdHeader(content);
                    if (error || !name) throw new Error(error || "no name in its frontmatter");
                    found.push({ name, files: { "SKILL.md": content }, replaces: false, problem: "" });
                } else {
                    throw new Error("upload a .zip or a SKILL.md");
                }
            } catch (e) {
                toast.error(`${file.name}: ${(e as Error).message}`);
            }
        }
        if (found.length === 0) return;
        setPending((current) => {
            const byName = new Map(current.map((p) => [p.name, p]));
            const own = skills.map((sk) => sk.name);
            for (const s of found) {
                const builtin = skills.some((sk) => sk.name === s.name && sk.builtin);
                const platformName = scope === "group" && platformSkills.some((sk) => sk.name === s.name);
                byName.set(s.name, {
                    ...s,
                    replaces: own.includes(s.name),
                    problem: !isValidSkillName(s.name)
                        ? "invalid name (lowercase letters, digits and hyphens)"
                        : builtin
                          ? "a built-in skill has this name: rename it in its SKILL.md"
                          : platformName
                            ? "a platform skill has this name: rename it in its SKILL.md"
                            : "",
                });
            }
            return Array.from(byName.values());
        });
    };

    const onFilesSelected = (e: ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files ? Array.from(e.target.files) : [];
        e.target.value = "";
        if (files.length) void chooseFiles(files);
    };

    const uploadPending = async () => {
        const toUpload = pending.filter((p) => !p.problem);
        setUploading(true);
        let uploaded = 0;
        for (const skill of toUpload) {
            try {
                await axios().put(skillUrl(scope, skill.name, groupId), { files: skill.files }, axiosAuth(accessToken));
                uploaded++;
            } catch (error) {
                axiosErrorHandler(error as AxiosError, authDispatch);
            }
        }
        setUploading(false);
        setPending([]);
        if (uploaded) toast.success(uploaded === 1 ? "1 skill uploaded" : `${uploaded} skills uploaded`);
        fetchSkills();
    };

    if (scope === "group" && groupsManaged.length === 0) {
        return <NoGroupsMessage>You do not manage any group.</NoGroupsMessage>;
    }

    if (editor) {
        return (
            <SkillEditor
                scope={scope}
                groupId={groupId}
                name={editor.name}
                suggestedName={editor.suggestedName}
                files={editor.files}
                existingNames={existingNames}
                readOnly={editor.readOnly}
                builtin={editor.builtin}
                onDuplicate={editor.duplicate}
                onClose={(saved) => {
                    setEditor(null);
                    if (saved) fetchSkills();
                }}
            />
        );
    }

    return (
        <Container>
            <HeaderContainer>
                {scope === "group" && (
                    <GroupSelectorLabel>
                        Group:
                        <GroupSelect
                            value={groupId ?? ""}
                            onChange={(e) => setGroupId(parseInt(e.target.value, 10))}
                            disabled={uploading}
                        >
                            {groupsManaged.map((group) => (
                                <option key={group.id} value={group.id}>
                                    {group.name} ({group.acronym}) - Id: {group.id}
                                </option>
                            ))}
                        </GroupSelect>
                    </GroupSelectorLabel>
                )}
                <InfoText>
                    {scope === "platform"
                        ? "Skills every group's AI agents can use."
                        : "Skills only this group's AI agents can use."}{" "}
                    Each AiAgent node chooses its skills in its Tools tab.
                </InfoText>
                <Button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                    Upload .zip / SKILL.md
                </Button>
            </HeaderContainer>
            {inUse && (
                <Panel warning>
                    <span>
                        The skill <b>{inUse.name}</b> is used by these AI agent nodes; they will no longer have it:
                    </span>
                    <ul style={{ margin: 0 }}>
                        {inUse.usedBy.map((u) => (
                            <li key={`${u.digitalTwinId}-${u.nodeName}`}>
                                {u.digitalTwinUid} (group {u.groupId}): node "{u.nodeName}"
                            </li>
                        ))}
                    </ul>
                    <PanelButtons>
                        <Button type="button" onClick={() => setInUse(null)}>
                            Cancel
                        </Button>
                        <Button type="button" danger onClick={() => deleteSkill(inUse.name, true, () => undefined)}>
                            Delete anyway
                        </Button>
                    </PanelButtons>
                </Panel>
            )}
            {pending.length !== 0 && (
                <Panel>
                    <span>Skills to upload:</span>
                    {pending.map((p) => (
                        <span key={p.name}>
                            {p.name} — {Object.keys(p.files).length} file(s)
                            {p.replaces && " (replaces the existing one)"}
                            {p.problem && <ErrorText> — {p.problem}</ErrorText>}
                        </span>
                    ))}
                    <PanelButtons>
                        <Button type="button" onClick={() => setPending([])} disabled={uploading}>
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            primary
                            onClick={() => void uploadPending()}
                            disabled={uploading || pending.every((p) => p.problem)}
                        >
                            {uploading ? "Uploading…" : "Upload"}
                        </Button>
                    </PanelButtons>
                </Panel>
            )}
            <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".zip,.md"
                style={{ display: "none" }}
                onChange={onFilesSelected}
            />
            {loading ? (
                <Loader />
            ) : (
                <TableWithPagination
                    dataTable={rows}
                    columnsTable={columnsTable as Column<any>[]}
                    componentName="skill"
                    reloadTable={fetchSkills}
                    createComponent={() => setEditor({})}
                />
            )}
            {scope === "group" && !loading && platformRows.length !== 0 && (
                <>
                    <SectionTitle>Platform skills (read-only: duplicate one to adapt it for this group)</SectionTitle>
                    <TableWithPagination
                        dataTable={platformRows}
                        columnsTable={platformColumnsTable as Column<any>[]}
                        componentName=""
                        reloadTable={fetchSkills}
                    />
                </>
            )}
        </Container>
    );
};

export default SkillsContainer;
