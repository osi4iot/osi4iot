import { FC, useCallback, useEffect, useMemo, useRef, useState, ChangeEvent } from "react";
import styled from "styled-components";
import { toast } from "react-toastify";
import { AxiosError, AxiosResponse } from "axios";
import { Column } from '../Utils/platformTable';
import { useAuthState, useAuthDispatch } from "../../../contexts/authContext";
import { axiosAuth, getDomainName, getProtocol } from "../../../tools/tools";
import { getAxiosInstance } from "../../../tools/axiosIntance";
import axiosErrorHandler from "../../../tools/axiosErrorHandler";
import formatDateString from "../../../tools/formatDate";
import TableWithPagination from "../Utils/TableWithPagination";
import Loader from "../../Tools/Loader";
import { IGroupManaged } from "../TableColumns/groupsManagedColumns";
import { Create_KNOWLEDGE_COLUMNS, IKnowledgeFile, IKnowledgeFileRow } from "../TableColumns/knowledgeColumns";

// The group's knowledge base: the documents its digital twins' AI agents
// read and search (each digital twin chooses which ones, by title, in its
// settings). pipelines indexes each one when it is uploaded (text, chunks
// and embeddings), so the Status column moves from Pending to Indexing…
// to Ready, or Error with the reason.
//
// Each document has an optional title, given when it is uploaded and
// editable in the table: what the document is about, which a file name
// often does not say. Without one the file name is shown.
//
// The knowledge base is off unless enabled for the organization and for
// the group: then nothing can be uploaded (and nothing is indexed).

// As admin_api accepts them (group_knowledge_upload_file).
const KNOWLEDGE_EXTENSIONS = [
    ".txt", ".md", ".markdown", ".csv", ".tsv", ".json", ".log", ".xml", ".yaml", ".yml",
    ".html", ".htm", ".rst", ".pdf", ".docx",
];
const KNOWLEDGE_MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB
// While some document is still being indexed the table refreshes itself.
const POLL_INTERVAL_MS = 4000;
const KNOWLEDGE_TITLE_MAX_LENGTH = 200;

const domainName = getDomainName();
const protocol = getProtocol();

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

const WarningText = styled.span`
    color: #f2cc0c;
`;

const UploadProgress = styled.span`
    color: #3274d9;
    font-weight: 600;
`;

// The files chosen to upload, each with its title, before uploading them.
const PendingUploads = styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: calc(100% - 40px);
    margin: 15px 20px 0 20px;
    padding: 12px 15px;
    border: 1px solid #2c3235;
    border-radius: 5px;
    background-color: #141619;
    color: white;
    font-size: 14px;
`;

const PendingUploadRow = styled.div`
    display: grid;
    grid-template-columns: minmax(150px, 1fr) 2fr;
    align-items: center;
    gap: 10px;
`;

const PendingFileName = styled.span`
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: #c9c9c9;
`;

const TitleInput = styled.input`
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

const PendingButtons = styled.div`
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    margin-top: 4px;
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
`;

interface IPendingUpload {
    file: File;
    title: string;
}

const NoGroupsMessage = styled.div`
    color: white;
    margin-top: 40px;
    font-size: 16px;
`;

const fileExtension = (fileName: string) => {
    const dot = fileName.lastIndexOf(".");
    return dot > 0 ? fileName.slice(dot).toLowerCase() : "";
};

// The checks admin_api does too, done here first so a whole batch is not
// sent for nothing.
const validateFile = (file: File): string | null => {
    if (!KNOWLEDGE_EXTENSIONS.includes(fileExtension(file.name))) {
        return `${file.name}: unsupported format (use ${KNOWLEDGE_EXTENSIONS.join(", ")})`;
    }
    if (file.size > KNOWLEDGE_MAX_FILE_SIZE) {
        return `${file.name}: larger than 100 MB`;
    }
    if (file.name.startsWith(".") || file.name.length > 200) {
        return `${file.name}: invalid file name`;
    }
    return null;
};

const toRows = (files: IKnowledgeFile[]): IKnowledgeFileRow[] =>
    files.map((file) => ({
        ...file,
        lastModifiedString: formatDateString(file.lastModified),
    }));

interface KnowledgeContainerProps {
    groupsManaged: IGroupManaged[];
}

const KnowledgeContainer: FC<KnowledgeContainerProps> = ({ groupsManaged }) => {
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();
    const [groupId, setGroupId] = useState<number | null>(groupsManaged.length ? groupsManaged[0].id : null);
    const [knowledgeFiles, setKnowledgeFiles] = useState<IKnowledgeFileRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);
    const [pendingUploads, setPendingUploads] = useState<IPendingUpload[]>([]);
    // null: not known yet (or admin_api could not say).
    const [ragEnabled, setRagEnabled] = useState<boolean | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const selectedGroup = useMemo(() => groupsManaged.find((group) => group.id === groupId), [groupsManaged, groupId]);

    const fetchKnowledgeFiles = useCallback(
        (showLoader: boolean) => {
            if (groupId === null) return;
            if (showLoader) setLoading(true);
            const config = axiosAuth(accessToken);
            const url = `${protocol}://${domainName}/admin_api/group_knowledge_file_list/${groupId}`;
            getAxiosInstance(refreshToken, authDispatch)
                .get(url, config)
                .then((response: AxiosResponse<IKnowledgeFile[]>) => {
                    setKnowledgeFiles(toRows(response.data));
                    setLoading(false);
                })
                .catch((error: AxiosError) => {
                    setKnowledgeFiles([]);
                    setLoading(false);
                    axiosErrorHandler(error, authDispatch);
                });
        },
        [accessToken, refreshToken, authDispatch, groupId],
    );

    const refreshKnowledgeFiles = useCallback(() => fetchKnowledgeFiles(true), [fetchKnowledgeFiles]);

    useEffect(() => {
        fetchKnowledgeFiles(true);
    }, [fetchKnowledgeFiles]);

    // Whether the group's knowledge base is enabled (organization and group).
    useEffect(() => {
        if (groupId === null) return;
        setRagEnabled(null);
        setPendingUploads([]);
        const config = axiosAuth(accessToken);
        const url = `${protocol}://${domainName}/admin_api/group_knowledge_enabled/${groupId}`;
        getAxiosInstance(refreshToken, authDispatch)
            .get(url, config)
            .then((response: AxiosResponse<{ enabled: boolean }>) => setRagEnabled(response.data.enabled === true))
            .catch(() => setRagEnabled(null));
    }, [accessToken, refreshToken, authDispatch, groupId]);

    // Follow the indexing of the documents that are not done yet.
    const indexingInProgress = knowledgeFiles.some((file) => file.status === "pending" || file.status === "indexing");
    useEffect(() => {
        if (!indexingInProgress || uploadProgress) return;
        const timer = setTimeout(() => fetchKnowledgeFiles(false), POLL_INTERVAL_MS);
        return () => clearTimeout(timer);
    }, [indexingInProgress, knowledgeFiles, uploadProgress, fetchKnowledgeFiles]);

    const openFileSelector = useCallback(() => {
        if (uploadProgress) return;
        if (ragEnabled === false) {
            toast.warning("The knowledge base is not enabled for this group");
            return;
        }
        fileInputRef.current?.click();
    }, [uploadProgress, ragEnabled]);

    // The chosen files wait, with a title each, until Upload is pressed. A
    // file already in the knowledge base starts with its title (an empty
    // title keeps no title).
    const chooseFiles = (files: File[]) => {
        const valid: File[] = [];
        for (const file of files) {
            const problem = validateFile(file);
            if (problem) toast.error(problem);
            else valid.push(file);
        }
        if (valid.length === 0) return;
        const titles = new Map(knowledgeFiles.map((file) => [file.fileName, file.title || ""]));
        setPendingUploads((current) => {
            const byName = new Map(current.map((pending) => [pending.file.name, pending]));
            for (const file of valid) {
                byName.set(file.name, { file, title: byName.get(file.name)?.title ?? titles.get(file.name) ?? "" });
            }
            return Array.from(byName.values());
        });
    };

    const setPendingTitle = (fileName: string, title: string) =>
        setPendingUploads((current) =>
            current.map((pending) => (pending.file.name === fileName ? { ...pending, title } : pending)),
        );

    const uploadFiles = async (pending: IPendingUpload[]) => {
        if (groupId === null || pending.length === 0) return;
        setPendingUploads([]);
        const valid = pending.map((p) => p.file);

        const existing = new Set(knowledgeFiles.map((file) => file.fileName));
        const replaced = valid.filter((file) => existing.has(file.name)).map((file) => file.name);
        if (replaced.length !== 0) {
            toast.info(`Replacing: ${replaced.join(", ")}`);
        }

        const config = axiosAuth(accessToken, "multipart/form-data");
        const axiosInstance = getAxiosInstance(refreshToken, authDispatch);
        let uploaded = 0;
        setUploadProgress({ done: 0, total: valid.length });
        // One at a time: they can be large, and pipelines indexes them in
        // the order they arrive anyway.
        for (const { file, title } of pending) {
            const formData = new FormData();
            formData.append("file", file, file.name);
            const url =
                `${protocol}://${domainName}/admin_api/group_knowledge_upload_file/${groupId}/${encodeURIComponent(file.name)}` +
                `?title=${encodeURIComponent(title.trim())}`;
            try {
                await axiosInstance.post(url, formData, config);
                uploaded++;
            } catch (error) {
                axiosErrorHandler(error as AxiosError, authDispatch);
            }
            setUploadProgress({ done: uploaded, total: valid.length });
        }
        setUploadProgress(null);
        if (uploaded !== 0) {
            toast.success(
                uploaded === 1
                    ? "1 document uploaded to the knowledge base"
                    : `${uploaded} documents uploaded to the knowledge base`,
            );
        }
        fetchKnowledgeFiles(false);
    };

    const onFilesSelected = (e: ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files ? Array.from(e.target.files) : [];
        // Allow selecting the same file again later.
        e.target.value = "";
        if (files.length !== 0) chooseFiles(files);
    };

    const columnsTable = useMemo(
        () => (groupId === null ? [] : Create_KNOWLEDGE_COLUMNS(groupId, refreshKnowledgeFiles)),
        [groupId, refreshKnowledgeFiles],
    );

    if (groupsManaged.length === 0) {
        return <NoGroupsMessage>You do not manage any group.</NoGroupsMessage>;
    }

    const indexingDisabled = knowledgeFiles.length !== 0 && knowledgeFiles.every((file) => file.status === "disabled");

    return (
        <Container>
            <HeaderContainer>
                <GroupSelectorLabel>
                    Group:
                    <GroupSelect
                        value={groupId ?? ""}
                        onChange={(e) => setGroupId(parseInt(e.target.value, 10))}
                        disabled={uploadProgress !== null}
                    >
                        {groupsManaged.map((group) => (
                            <option key={group.id} value={group.id}>
                                {group.name} ({group.acronym}) - Id: {group.id}
                            </option>
                        ))}
                    </GroupSelect>
                </GroupSelectorLabel>
                <InfoText>Text, Markdown, CSV, JSON, HTML, PDF and Word (.docx) — up to 100 MB each</InfoText>
                {selectedGroup && !selectedGroup.llmEnabled && (
                    <WarningText>AI agents are not enabled for this group</WarningText>
                )}
                {ragEnabled === false && (
                    <WarningText>
                        The knowledge base is not enabled for this group: it must be enabled for its organization and
                        for the group. Documents cannot be uploaded and are not indexed.
                    </WarningText>
                )}
                {indexingDisabled && (
                    <WarningText>This platform has no knowledge database: documents are stored but not indexed</WarningText>
                )}
                {uploadProgress && (
                    <UploadProgress>
                        Uploading {Math.min(uploadProgress.done + 1, uploadProgress.total)} of {uploadProgress.total}…
                    </UploadProgress>
                )}
            </HeaderContainer>
            {pendingUploads.length !== 0 && (
                <PendingUploads>
                    <span>Title of each document (optional: what it is about; without one the file name is shown)</span>
                    {pendingUploads.map((pending) => (
                        <PendingUploadRow key={pending.file.name}>
                            <PendingFileName title={pending.file.name}>{pending.file.name}</PendingFileName>
                            <TitleInput
                                value={pending.title}
                                maxLength={KNOWLEDGE_TITLE_MAX_LENGTH}
                                placeholder="Title"
                                onChange={(e) => setPendingTitle(pending.file.name, e.target.value)}
                            />
                        </PendingUploadRow>
                    ))}
                    <PendingButtons>
                        <Button type="button" onClick={() => setPendingUploads([])}>
                            Cancel
                        </Button>
                        <Button type="button" onClick={openFileSelector}>
                            Add files
                        </Button>
                        <Button type="button" primary onClick={() => uploadFiles(pendingUploads)}>
                            Upload {pendingUploads.length === 1 ? "1 document" : `${pendingUploads.length} documents`}
                        </Button>
                    </PendingButtons>
                </PendingUploads>
            )}
            <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={KNOWLEDGE_EXTENSIONS.join(",")}
                style={{ display: "none" }}
                onChange={onFilesSelected}
            />
            {loading ? (
                <Loader />
            ) : (
                <TableWithPagination
                    dataTable={knowledgeFiles}
                    columnsTable={columnsTable as Column<any>[]}
                    componentName="document"
                    reloadTable={refreshKnowledgeFiles}
                    createComponent={openFileSelector}
                />
            )}
        </Container>
    );
};

export default KnowledgeContainer;

