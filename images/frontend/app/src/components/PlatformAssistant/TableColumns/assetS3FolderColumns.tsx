import { Column } from "react-table";
import { axiosAuth, getDomainName, getProtocol } from "../../../tools/tools";
import {
    setReloadAssetS3FoldersTable,
    setReloadDashboardsTable,
    setReloadTopicsTable,
    usePlatformAssitantDispatch,
} from "../../../contexts/platformAssistantContext";
import { AxiosResponse, AxiosError } from "axios";
import EditIcon from "../Utils/EditIcon";
import DeleteIcon from "../Utils/DeleteIcon";
import { FC, useState, useEffect, SyntheticEvent } from "react";
import { toast } from "react-toastify";
import { useAuthState, useAuthDispatch } from "../../../contexts/authContext";
import axiosErrorHandler from "../../../tools/axiosErrorHandler";
import { getAxiosInstance } from "../../../tools/axiosIntance";
import DeleteModal from "../../Tools/DeleteModal";
import { ASSET_S3_FOLDER_OPTIONS } from "../Utils/platformAssistantOptions";
import {
    setAssetS3FolderIdToEdit,
    setAssetS3FolderOptionToShow,
    setAssetS3FolderRowIndexToEdit,
    useAssetS3FolderDispatch,
} from "../../../contexts/assetS3FolderOptions";
import DownloadFileIcon from "../Utils/DownloadFileIcon";
import DownloadS3FolderZipFile from "../../Tools/DownloadS3FolderZipFile";

export default interface IAssetS3Folder {
    id?: number;
    orgId: number;
    groupId: number;
    groupUid: string;
    assetId: number;
    assetUid: string;
    folderName: string;
    lastS3Storage: string;
    parquetSchema: string;
    parquetFileCount: number;
    parquetTotalBytes: number;
    parquetTotalMBytes: string;
    version: number;
    isCurrent: boolean | string;
    validFrom: string;
    validTo: string;
    created?: string;
    updated?: string;
}

interface IAssetS3FolderColumn extends IAssetS3Folder {
    downloadZipFile: string;
    edit: string;
    delete: string;
}

interface DeleteAssetS3FolderModalProps {
    rowIndex: number;
    groupId: number;
    assetId: number;
    folderName: string;
    isCurrent: boolean | string;
    refreshAssetS3Folders: () => void;
}

const domainName = getDomainName();
const protocol = getProtocol();

const DeleteAssetS3FolderModal: FC<DeleteAssetS3FolderModalProps> = ({
    rowIndex,
    groupId,
    assetId,
    folderName,
    isCurrent,
    refreshAssetS3Folders,
}) => {
    const plaformAssistantDispatch = usePlatformAssitantDispatch();
    const [isAssetS3FolderDeleted, setIsAssetS3FolderDeleted] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const title = "DELETE ASSET S3 FOLDER";
    const question = "Are you sure to delete this asset S3 folder?";
    const consequences = "Sensors of this asset S3 folder are going to be lost.";
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();

    const showLoader = () => {
        setIsSubmitting(true);
    };

    useEffect(() => {
        if (isAssetS3FolderDeleted) {
            refreshAssetS3Folders();
            const reloadAssetS3FoldersTable = true;
            setReloadAssetS3FoldersTable(plaformAssistantDispatch, { reloadAssetS3FoldersTable });
            const reloadTopicsTable = true;
            setReloadTopicsTable(plaformAssistantDispatch, { reloadTopicsTable });
            const reloadDashboardsTable = true;
            setReloadDashboardsTable(plaformAssistantDispatch, { reloadDashboardsTable });
        }
    }, [isAssetS3FolderDeleted, plaformAssistantDispatch, refreshAssetS3Folders]);

    const action = (hideModal: () => void) => {
        const url = `${protocol}://${domainName}/admin_api/asset_s3_folder/${groupId}/${assetId}/${folderName}`;
        const config = axiosAuth(accessToken);
        getAxiosInstance(refreshToken, authDispatch)
            .delete(url, config)
            .then((response: AxiosResponse<any, any>) => {
                setIsAssetS3FolderDeleted(true);
                setIsSubmitting(false);
                const data = response.data;
                toast.success(data.message);
                hideModal();
            })
            .catch((error: AxiosError) => {
                axiosErrorHandler(error, authDispatch);
                setIsSubmitting(false);
                hideModal();
            });
    };

    const [showModal] = DeleteModal(title, question, consequences, action, isSubmitting, showLoader);

    return (
        <DeleteIcon
            action={showModal}
            rowIndex={rowIndex}
            undeletable={isCurrent === "No"}
            undeletableMessage="Only current asset S3 folder can be deleted."
        />
    );
};

interface EditAssetS3FolderProps {
    rowIndex: number;
    assetS3FolderId: number;
}

const EditAssetS3Folder: FC<EditAssetS3FolderProps> = ({ rowIndex, assetS3FolderId }) => {
    const assetS3FolderDispatch = useAssetS3FolderDispatch();

    const handleClick = () => {
        const assetS3FolderIdToEdit = { assetS3FolderIdToEdit: assetS3FolderId };
        setAssetS3FolderIdToEdit(assetS3FolderDispatch, assetS3FolderIdToEdit);

        const assetS3FolderRowIndexToEdit = { assetS3FolderRowIndexToEdit: rowIndex };
        setAssetS3FolderRowIndexToEdit(assetS3FolderDispatch, assetS3FolderRowIndexToEdit);

        const assetS3FolderOptionToShow = { assetS3FolderOptionToShow: ASSET_S3_FOLDER_OPTIONS.EDIT_ASSET_S3_FOLDER };
        setAssetS3FolderOptionToShow(assetS3FolderDispatch, assetS3FolderOptionToShow);
    };

    return (
        <span onClick={handleClick}>
            <EditIcon rowIndex={rowIndex} />
        </span>
    );
};

interface DownLoadZipFileProps {
    rowIndex: number;
    groupId: number;
    assetId: number;
    folderName: string;
    isCurrent: boolean | string;
}

const DownLoadZipFile: FC<DownLoadZipFileProps> = ({ rowIndex, groupId, assetId, folderName, isCurrent }) => {
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [selectedInitDate, setSelectedInitDate] = useState(new Date());
    const [selectedFinalDate, setSelectedFinalDate] = useState(new Date());

    const changeSelectedInitDate = (selectedDate: Date) => {
        setSelectedInitDate(selectedDate);
    };

    const changeSelectedFinalDate = (selectedDate: Date) => {
        setSelectedFinalDate(selectedDate);
    };

    const showLoader = () => {
        setIsSubmitting(true);
    };

    const action = (hideModal: () => void, selectedInitDate: Date, selectedFinalDate: Date) => {
        const initDate = selectedInitDate.toISOString().split("T")[0];
        const finalDate = selectedFinalDate.toISOString().split("T")[0];
        const urlBase = `${protocol}://${domainName}/admin_api`;
        const urlBaseGetToken = `${urlBase}/asset_s3_folder_token`;
        const urlGetToken = `${urlBaseGetToken}/${groupId}/${assetId}/${folderName}/${initDate}/${finalDate}`;
        const config = axiosAuth(accessToken);

        getAxiosInstance(refreshToken, authDispatch)
            .get(urlGetToken, config)
            .then((response: AxiosResponse<any, any>) => {
                setIsSubmitting(true);
                const token = response.data.token;
                const encodedToken = encodeURIComponent(token);
                const urlBaseDownload = `${urlBase}/asset_s3_folder_download`;
                const urlDownload = `${urlBaseDownload}/${groupId}/${assetId}/${folderName}/${initDate}/${finalDate}/${encodedToken}`;
                var tempLink = document.createElement("a");
                tempLink.style.display = "none";
                tempLink.href = urlDownload;
                const fileName = `${folderName}_${initDate}_${finalDate}.zip`;
                tempLink.setAttribute("download", fileName);
                if (typeof tempLink.download === "undefined") {
                    tempLink.setAttribute("target", "_blank");
                }
                document.body.appendChild(tempLink);
                tempLink.click();
                setTimeout(function () {
                    document.body.removeChild(tempLink);
                }, 200);
                const message = "Asset data in S3 bucket download successfully.";
                toast.success(message);
            })
            .catch((error: AxiosError) => {
                axiosErrorHandler(error, authDispatch);
            })
            .finally(() => {
                setIsSubmitting(false);
                hideModal();
            });
    };

    const [showModal] = DownloadS3FolderZipFile(
        action,
        isSubmitting,
        showLoader,
        selectedInitDate,
        changeSelectedInitDate,
        selectedFinalDate,
        changeSelectedFinalDate,
    );

    const handleClick = (e: SyntheticEvent) => {
        if ((isCurrent as string) === "No") {
            const message = "Only current asset S3 folders can be downloaded.";
            toast.error(message);
            return;
        }
        showModal();
    };

    return (
        <span onClick={handleClick}>
            <DownloadFileIcon rowIndex={rowIndex} />
        </span>
    );
};

export const Create_ASSET_S3_FOLDER_COLUMNS = (refreshAssetS3Folders: () => void): Column<IAssetS3FolderColumn>[] => {
    return [
        {
            Header: "Id",
            accessor: "id",
            filter: "equals",
        },
        {
            Header: "OrgId",
            accessor: "orgId",
            filter: "equals",
        },
        {
            Header: "GroupId",
            accessor: "groupId",
            filter: "equals",
        },
        {
            Header: "AssetId",
            accessor: "assetId",
            filter: "equals",
        },
        {
            Header: "FolderName",
            accessor: "folderName",
            filter: "equals",
        },
        {
            Header: "Version",
            accessor: "version",
            filter: "equals",
        },
        {
            Header: "Nº of files",
            accessor: "parquetFileCount",
            disableFilters: true,
            disableSortBy: true,
        },
        {
            Header: "Total size (Mb)",
            accessor: "parquetTotalMBytes",
            disableFilters: true,
            disableSortBy: true,
        },
        {
            Header: "Last storage",
            accessor: "lastS3Storage",
            disableFilters: true,
            disableSortBy: true,
        },
        {
            Header: "Is current",
            accessor: "isCurrent",
            disableFilters: true,
            disableSortBy: true,
        },
        {
            Header: () => (
                <div style={{ backgroundColor: "#202226" }}>
                    Download
                    <br />
                    zip file
                </div>
            ),
            accessor: "downloadZipFile",
            disableFilters: true,
            disableSortBy: true,
            Cell: (props) => {
                const rowIndex = parseInt(props.row.id, 10);
                const row = props.rows.filter((row) => row.index === rowIndex)[0];
                const groupId = row?.cells[2]?.value;
                const assetId = row?.cells[3]?.value;
                const folderName = row?.cells[4]?.value;
                const isCurrent = row?.cells[9]?.value;
                return (
                    <DownLoadZipFile
                        rowIndex={rowIndex}
                        groupId={groupId}
                        assetId={assetId}
                        folderName={folderName}
                        isCurrent={isCurrent}
                    />
                );
            },
        },
        {
            Header: "",
            accessor: "edit",
            disableFilters: true,
            disableSortBy: true,
            Cell: (props) => {
                const rowIndex = parseInt(props.row.id, 10);
                const row = props.rows.filter((row) => row.index === rowIndex)[0];
                const assetS3FolderId = row?.cells[0]?.value;
                return (
                    <EditAssetS3Folder assetS3FolderId={assetS3FolderId} rowIndex={rowIndex} />
                );
            },
        },
        {
            Header: "",
            accessor: "delete",
            disableFilters: true,
            disableSortBy: true,
            Cell: (props) => {
                const rowIndex = parseInt(props.row.id, 10);
                const row = props.rows.filter((row) => row.index === rowIndex)[0];
                const groupId = row?.cells[2]?.value;
                const assetId = row?.cells[3]?.value;
                const folderName = row?.cells[4]?.value;
                const isCurrent = row?.cells[9]?.value;
                return (
                    <DeleteAssetS3FolderModal
                        groupId={groupId}
                        assetId={assetId}
                        folderName={folderName}
                        rowIndex={rowIndex}
                        isCurrent={isCurrent}
                        refreshAssetS3Folders={refreshAssetS3Folders}
                    />
                );
            },
        },
    ];
};
