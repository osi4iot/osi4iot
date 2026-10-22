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
    // pending | indexing | ready | error | disabled
    status: string;
    numChunks: number;
    error: string;
}

export interface IKnowledgeFileRow extends IKnowledgeFile {
    sizeMB: string;
    lastModifiedString: string;
}

interface IKnowledgeFileColumn extends IKnowledgeFileRow {
    download: string;
    delete: string;
}

const domainName = getDomainName();
const protocol = getProtocol();

const STATUS_LABELS: Record<string, { label: string; color: string; title: string }> = {
    pending: { label: "Pending", color: "#c9c9c9", title: "Uploaded, waiting for pipelines to index it" },
    indexing: { label: "Indexing…", color: "#f2cc0c", title: "pipelines is extracting the text and computing the embeddings" },
    ready: { label: "Ready", color: "#73bf69", title: "Indexed: the group's AI agents can search it" },
    error: { label: "Error", color: "#f2495c", title: "It could not be indexed" },
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
            Header: "Size (MB)",
            accessor: "sizeMB",
        },
        {
            Header: "Last modified",
            accessor: "lastModifiedString",
        },
        {
            Header: "Status",
            accessor: "status",
            Cell: ({ value }: CellProps<IKnowledgeFileColumn, string>) => {
                const status = STATUS_LABELS[value] || { label: value, color: "white", title: "" };
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
        },
        {
            Header: "Indexing error",
            accessor: "error",
            Cell: ({ value }: CellProps<IKnowledgeFileColumn, string>) => <ErrorText>{value}</ErrorText>,
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
