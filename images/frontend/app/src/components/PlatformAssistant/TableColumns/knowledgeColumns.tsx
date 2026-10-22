import { FC, useState, useEffect } from "react";
import { Column, CellProps } from "react-table";
import { toast } from "react-toastify";
import styled from "styled-components";
import { AxiosResponse, AxiosError } from "axios";
import { axiosAuth, getDomainName, getProtocol } from "../../../tools/tools";
import { useAuthState, useAuthDispatch } from "../../../contexts/authContext";
import { getAxiosInstance } from "../../../tools/axiosIntance";
import axiosErrorHandler from "../../../tools/axiosErrorHandler";
import DeleteIcon from "../Utils/DeleteIcon";
import DownloadFileIcon from "../Utils/DownloadFileIcon";
import DeleteModal from "../../Tools/DeleteModal";

// A document of a group's knowledge base, as admin_api's
// group_knowledge_file_list returns it.
export interface IKnowledgeFile {
    fileName: string;
    lastModified: string;
    size: number;
    // pending | indexing | ready | error | disabled | unknown
    status: string;
    numChunks: number;
    error: string;
}

export interface IKnowledgeFileRow extends IKnowledgeFile {
    lastModifiedString: string;
}

interface IKnowledgeFileColumn extends IKnowledgeFileRow {
    download: string;
    delete: string;
}

// 512 B, 12.3 KB, 4.56 MB: readable also for small files.
const formatFileSize = (bytes: number): string => {
    if (!Number.isFinite(bytes) || bytes < 0) return "";
    if (bytes < 1024) return `${bytes} B`;
    const units = ["KB", "MB", "GB"];
    let value = bytes / 1024;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit++;
    }
    return `${value.toFixed(value < 10 ? 2 : value < 100 ? 1 : 0)} ${units[unit]}`;
};

const domainName = getDomainName();
const protocol = getProtocol();

const STATUS_LABELS: Record<string, { label: string; color: string; title: string }> = {
    pending: { label: "Pending", color: "#c9c9c9", title: "Uploaded, waiting for pipelines to index it" },
    indexing: { label: "Indexing…", color: "#f2cc0c", title: "pipelines is extracting the text and computing the embeddings" },
    ready: { label: "Ready", color: "#73bf69", title: "Indexed: the group's AI agents can search it" },
    error: { label: "Error", color: "#f2495c", title: "It could not be indexed" },
    unknown: { label: "Unknown", color: "#8e8e8e", title: "admin_api could not read the indexing status (see its log)" },
    disabled: { label: "Not indexed", color: "#8e8e8e", title: "This platform has no knowledge database (it needs Patroni)" },
};

const StatusText = styled.span<{ color: string }>`
    color: ${(props) => props.color};
    font-weight: 600;
`;

const ErrorText = styled.span`
    color: #f2495c;
    white-space: normal;
`;

const knowledgeFileUrl = (action: string, groupId: number, fileName: string) =>
    `${protocol}://${domainName}/admin_api/group_knowledge_${action}/${groupId}/${encodeURIComponent(fileName)}`;

interface DownloadKnowledgeFileProps {
    rowIndex: number;
    groupId: number;
    fileName: string;
}

const DownloadKnowledgeFile: FC<DownloadKnowledgeFileProps> = ({ rowIndex, groupId, fileName }) => {
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();

    const handleClick = () => {
        const config = { ...axiosAuth(accessToken), responseType: "blob" as const };
        getAxiosInstance(refreshToken, authDispatch)
            .get(knowledgeFileUrl("download_file", groupId, fileName), config)
            .then((response: AxiosResponse<Blob>) => {
                const url = URL.createObjectURL(response.data);
                const link = document.createElement("a");
                link.href = url;
                link.download = fileName;
                document.body.appendChild(link);
                link.click();
                link.remove();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
            })
            .catch((error: AxiosError) => {
                axiosErrorHandler(error, authDispatch);
            });
    };

    return (
        <span onClick={handleClick} title={`Download ${fileName}`}>
            <DownloadFileIcon rowIndex={rowIndex} />
        </span>
    );
};

interface DeleteKnowledgeFileModalProps {
    rowIndex: number;
    groupId: number;
    fileName: string;
    refreshKnowledgeFiles: () => void;
}

const DeleteKnowledgeFileModal: FC<DeleteKnowledgeFileModalProps> = ({
    rowIndex,
    groupId,
    fileName,
    refreshKnowledgeFiles,
}) => {
    const [isFileDeleted, setIsFileDeleted] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const title = "DELETE DOCUMENT";
    const question = `Are you sure to delete ${fileName}?`;
    const consequences = "The group's AI agents will no longer find its content.";
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();

    const showLoader = () => {
        setIsSubmitting(true);
    };

    useEffect(() => {
        if (isFileDeleted) {
            refreshKnowledgeFiles();
        }
    }, [isFileDeleted, refreshKnowledgeFiles]);

    const action = (hideModal: () => void) => {
        const config = axiosAuth(accessToken);
        getAxiosInstance(refreshToken, authDispatch)
            .delete(knowledgeFileUrl("delete_file", groupId, fileName), config)
            .then((response: AxiosResponse<any, any>) => {
                setIsFileDeleted(true);
                setIsSubmitting(false);
                toast.success(response.data.message);
                hideModal();
            })
            .catch((error: AxiosError) => {
                axiosErrorHandler(error, authDispatch);
                setIsSubmitting(false);
                hideModal();
            });
    };

    const [showModal] = DeleteModal(title, question, consequences, action, isSubmitting, showLoader);

    return <DeleteIcon action={showModal} rowIndex={rowIndex} />;
};

export const Create_KNOWLEDGE_COLUMNS = (
    groupId: number,
    refreshKnowledgeFiles: () => void,
): Column<IKnowledgeFileColumn>[] => {
    return [
        {
            Header: "File",
            accessor: "fileName",
        },
        {
            Header: "Size",
            // The bytes, so it sorts by size; shown in B, KB, MB or GB.
            accessor: "size",
            Cell: ({ value }: CellProps<IKnowledgeFileColumn, number>) => <span>{formatFileSize(value)}</span>,
        },
        {
            Header: "Last modified",
            accessor: "lastModifiedString",
        },
        {
            Header: "Status",
            accessor: "status",
            Cell: ({ value }: CellProps<IKnowledgeFileColumn, string>) => {
                // No status: the admin_api answering is older than the knowledge
                // bases' indexing (it does not report it).
                const status = value
                    ? STATUS_LABELS[value] || { label: value, color: "white", title: "" }
                    : { label: "Unknown", color: "#8e8e8e", title: "admin_api did not report the indexing status: update admin_api" };
                return (
                    <StatusText color={status.color} title={status.title}>
                        {status.label}
                    </StatusText>
                );
            },
        },
        {
            Header: "Chunks",
            accessor: "numChunks",
            // Fragments of text indexed for search (only once it is ready).
            Cell: ({ row, value }: CellProps<IKnowledgeFileColumn, number>) =>
                row.original.status === "ready" ? <span>{value ?? 0}</span> : <span>-</span>,
        },
        {
            // Why the document could not be indexed (empty when it was).
            Header: "Indexing error",
            accessor: "error",
            Cell: ({ value }: CellProps<IKnowledgeFileColumn, string>) => <ErrorText title={value}>{value || ""}</ErrorText>,
        },
        {
            Header: "",
            accessor: "download",
            disableFilters: true,
            disableSortBy: true,
            Cell: ({ row }: CellProps<IKnowledgeFileColumn>) => (
                <DownloadKnowledgeFile rowIndex={row.index} groupId={groupId} fileName={row.original.fileName} />
            ),
        },
        {
            Header: "",
            accessor: "delete",
            disableFilters: true,
            disableSortBy: true,
            Cell: ({ row }: CellProps<IKnowledgeFileColumn>) => (
                <DeleteKnowledgeFileModal
                    rowIndex={row.index}
                    groupId={groupId}
                    fileName={row.original.fileName}
                    refreshKnowledgeFiles={refreshKnowledgeFiles}
                />
            ),
        },
    ];
};

