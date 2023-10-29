import { FC, useState, useEffect } from 'react';
import { Column } from 'react-table';
import { toast } from 'react-toastify';
import { axiosAuth, getDomainName, getProtocol } from '../../../tools/tools';
import { useAuthState, useAuthDispatch } from '../../../contexts/authContext';
import EditIcon from '../Utils/EditIcon';
import DeleteIcon from '../Utils/DeleteIcon';
import DeleteModal from '../../Tools/DeleteModal';
import { ASSETS_OPTIONS } from '../Utils/platformAssistantOptions';
import {
    setAssetIdToEdit,
    setAssetInputData,
    setAssetRowIndexToEdit,
    setAssetsOptionToShow,
    useAssetsDispatch
} from '../../../contexts/assetsOptions';

import {
    setReloadDashboardsTable,
    setReloadTopicsTable,
    setReloadSensorsTable,
    usePlatformAssitantDispatch,
    setReloadDigitalTwinsTable
} from '../../../contexts/platformAssistantContext';
import { getAxiosInstance } from '../../../tools/axiosIntance';
import axiosErrorHandler from '../../../tools/axiosErrorHandler';
import { IAssetInputData } from '../../../contexts/assetsOptions/interfaces';
import { IAssetType } from './assetTypesColumns';
import { IGroupManaged } from './groupsManagedColumns';
import { IOrgOfGroupsManaged } from './orgsOfGroupsManagedColumns';


export interface IAsset {
    id: number;
    orgId: number;
    groupId: number;
    assetUid: string;
    assetTypeId: number;
    description: string;
    assetType: string;
    iconRadio: number;
    latitude: number;
    longitude: number;
    geolocationMode: string;
}


interface IAssetColumn extends IAsset {
    edit: string;
    delete: string;
}

interface DeleteAssetModalProps {
    rowIndex: number;
    groupId: number;
    assetId: number;
    refreshAssets: () => void;
}

const domainName = getDomainName();
const protocol = getProtocol();

const DeleteAssetModal: FC<DeleteAssetModalProps> = ({ rowIndex, groupId, assetId, refreshAssets }) => {
    const plaformAssistantDispatch = usePlatformAssitantDispatch();
    const [isAssetDeleted, setIsAssetDeleted] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const title = "DELETE ASSET";
    const question = "Are you sure to delete this asset?";
    const consequences = "Sensors of this asset are going to be lost.";
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();

    const showLoader = () => {
        setIsSubmitting(true);
    }

    useEffect(() => {
        if (isAssetDeleted) {
            refreshAssets();
            const reloadSensorsTable = true;
            setReloadSensorsTable(plaformAssistantDispatch, { reloadSensorsTable });
            const reloadTopicsTable = true;
            setReloadTopicsTable(plaformAssistantDispatch, { reloadTopicsTable });
            const reloadDashboardsTable = true;
            setReloadDashboardsTable(plaformAssistantDispatch, { reloadDashboardsTable });
            const reloadDigitalTwinsTable = true;
            setReloadDigitalTwinsTable(plaformAssistantDispatch, { reloadDigitalTwinsTable })
        }
    }, [isAssetDeleted, plaformAssistantDispatch, refreshAssets]);

    const action = (hideModal: () => void) => {
        const url = `${protocol}://${domainName}/admin_api/asset/${groupId}/id/${assetId}`;
        const config = axiosAuth(accessToken);
        getAxiosInstance(refreshToken, authDispatch)
            .delete(url, config)
            .then((response) => {
                setIsAssetDeleted(true);
                setIsSubmitting(false);
                const data = response.data;
                toast.success(data.message);
                hideModal();

            })
            .catch((error) => {
                axiosErrorHandler(error, authDispatch);
                setIsSubmitting(false);
                hideModal();
            })
    }

    const [showModal] = DeleteModal(title, question, consequences, action, isSubmitting, showLoader);

    return (
        <DeleteIcon action={showModal} rowIndex={rowIndex} />
    )
}

interface EditAssetProps {
    rowIndex: number;
    assetId: number;
    assetInputData: IAssetInputData;
}

const EditAsset: FC<EditAssetProps> = ({ rowIndex, assetId, assetInputData }) => {
    const assetsDispatch = useAssetsDispatch()

    const handleClick = () => {
        const assetIdToEdit = { assetIdToEdit: assetId };
        setAssetIdToEdit(assetsDispatch, assetIdToEdit);

        const assetInputFormData = { assetInputFormData: assetInputData }
        setAssetInputData(assetsDispatch, assetInputFormData);

        const assetRowIndexToEdit = { assetRowIndexToEdit: rowIndex };
        setAssetRowIndexToEdit(assetsDispatch, assetRowIndexToEdit);

        const assetsOptionToShow = { assetsOptionToShow: ASSETS_OPTIONS.EDIT_ASSET };
        setAssetsOptionToShow(assetsDispatch, assetsOptionToShow);
    };


    return (
        <span onClick={handleClick}>
            <EditIcon rowIndex={rowIndex} />
        </span>
    )
}


export const Create_ASSETS_COLUMNS = (
    orgsOfGroupManaged: IOrgOfGroupsManaged[],
    groupsManaged: IGroupManaged[],
    assetTypes: IAssetType[],
    refreshAssets: () => void
): Column<IAssetColumn>[] => {
    return [
        {
            Header: "Id",
            accessor: "id",
            filter: 'equals'
        },
        {
            Header: "OrgId",
            accessor: "orgId",
            filter: 'equals'
        },
        {
            Header: "GroupId",
            accessor: "groupId",
            filter: 'equals'
        },
        {
            Header: "AssetUid",
            accessor: "assetUid",
            filter: 'equals'
        },
        {
            Header: "Type",
            accessor: "assetType",
        },
        {
            Header: "Description",
            accessor: "description"
        },
        {
            Header: () => <div style={{ backgroundColor: '#202226' }}>Icon<br />radio</div>,
            accessor: "iconRadio",
            disableFilters: true,
            disableSortBy: true
        },
        {
            Header: "Longitude",
            accessor: "longitude",
            disableFilters: true,
            disableSortBy: true
        },
        {
            Header: "Latitude",
            accessor: "latitude",
            disableFilters: true,
            disableSortBy: true
        },
        {
            Header: "",
            accessor: "edit",
            disableFilters: true,
            disableSortBy: true,
            Cell: props => {
                const rowIndex = parseInt(props.row.id, 10);
                const row = props.rows.filter(row => row.index === rowIndex)[0];
                const assetId = row?.cells[0]?.value;
                const orgId = row?.cells[1]?.value;
                const assetType = row?.cells[4]?.value;
                const orgAcronym = orgsOfGroupManaged.filter(org => org.id === orgId)[0].acronym;
                const groupId = row?.cells[2]?.value;
                const groupAcronym = groupsManaged.filter(group => group.id === groupId)[0].acronym;
                const iconSvgString = assetTypes.filter(item => item.orgId === orgId && item.type === assetType)[0].iconSvgString;
                const assetInputData = {
                    orgAcronym,
                    orgId,
                    groupAcronym,
                    groupId,
                    assetUid: row?.cells[3]?.value,
                    assetType,
                    description: row?.cells[5]?.value,
                    iconRadio: row?.cells[6]?.value,
                    longitude: row?.cells[7]?.value,
                    latitude: row?.cells[8]?.value,
                    iconSvgString
                }
                return <EditAsset assetId={assetId} rowIndex={rowIndex} assetInputData={assetInputData} />
            }
        },
        {
            Header: "",
            accessor: "delete",
            disableFilters: true,
            disableSortBy: true,
            Cell: props => {
                const rowIndex = parseInt(props.row.id, 10);
                const row = props.rows.filter(row => row.index === rowIndex)[0];
                const assetId = row?.cells[0]?.value;
                const groupId = row?.cells[2]?.value;
                return <DeleteAssetModal assetId={assetId} groupId={groupId} rowIndex={rowIndex} refreshAssets={refreshAssets} />
            }
        }
    ]
}
