import React, { FC } from 'react'
import TableWithPagination from '../Utils/TableWithPagination';
import { ASSET_S3_FOLDER_OPTIONS } from '../Utils/platformAssistantOptions';
import {
    setAssetS3FolderOptionToShow,
    useAssetS3FolderDispatch,
    useAssetS3FolderOptionToShow
} from '../../../contexts/assetS3FolderOptions';
import CreateAssetS3Folder from './CreateAssetS3Folder';
import EditAssetS3Folder from './EditAssetS3Folder';
import IAssetS3Folder, { Create_ASSET_S3_FOLDER_COLUMNS } from '../TableColumns/assetS3FolderColumns';

interface AssetS3FolderContainerProps {
    assetS3Folders: IAssetS3Folder[];
    refreshAssetS3Folders: () => void;
}

const AssetS3FolderContainer: FC<AssetS3FolderContainerProps> = ({
    assetS3Folders,
    refreshAssetS3Folders
}) => {
    const assetS3FolderDispatch = useAssetS3FolderDispatch();
    const assetS3FolderOptionToShow = useAssetS3FolderOptionToShow();

    const showAssetS3FolderTableOption = () => {
        setAssetS3FolderOptionToShow(assetS3FolderDispatch, { assetS3FolderOptionToShow: ASSET_S3_FOLDER_OPTIONS.TABLE });
    }

    return (
        <>
            {
                assetS3FolderOptionToShow === ASSET_S3_FOLDER_OPTIONS.CREATE_ASSET_S3_FOLDER &&
                <CreateAssetS3Folder
                    backToTable={showAssetS3FolderTableOption}
                    refreshAssetS3Folders={refreshAssetS3Folders}
                />
            }
            {
                assetS3FolderOptionToShow === ASSET_S3_FOLDER_OPTIONS.EDIT_ASSET_S3_FOLDER &&
                <EditAssetS3Folder
                    assetS3Folders={assetS3Folders}
                    backToTable={showAssetS3FolderTableOption}
                    refreshAssetS3Folders={refreshAssetS3Folders}
                />
            }
            {assetS3FolderOptionToShow === ASSET_S3_FOLDER_OPTIONS.TABLE &&
                <TableWithPagination
                    dataTable={assetS3Folders}
                    columnsTable={Create_ASSET_S3_FOLDER_COLUMNS(refreshAssetS3Folders)}
                    componentName="S3 folder"
                    reloadTable={refreshAssetS3Folders}
                    createComponent={() => setAssetS3FolderOptionToShow(assetS3FolderDispatch, { assetS3FolderOptionToShow: ASSET_S3_FOLDER_OPTIONS.CREATE_ASSET_S3_FOLDER })}
                />
            }
        </>
    )
}

export default AssetS3FolderContainer;