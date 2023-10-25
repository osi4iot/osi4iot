import { FC, useState, useEffect } from 'react';
import { Column } from 'react-table';
import { toast } from 'react-toastify';
import { axiosAuth, getDomainName, getProtocol } from '../../../tools/tools';
import { useAuthState, useAuthDispatch } from '../../../contexts/authContext';
import EditIcon from '../Utils/EditIcon';
import DeleteIcon from '../Utils/DeleteIcon';
import DeleteModal from '../../Tools/DeleteModal';
import { getAxiosInstance } from '../../../tools/axiosIntance';
import axiosErrorHandler from '../../../tools/axiosErrorHandler';
import { usePlatformAssitantDispatch } from '../../../contexts/platformAssistantContext';
import { setAssetTypeIdToEdit, setAssetTypeRowIndexToEdit, setAssetTypesOptionToShow, useAssetTypesDispatch } from '../../../contexts/assetTypes.Options';
import { ASSET_TYPES_OPTIONS } from '../Utils/platformAssistantOptions';

export interface IAssetType {
    id: number;
    orgId: number;
    assetTypeUid: string;
    type: string;
    iconSvgFileName: string;
    iconSvgString: string;
    geolocationMode: string;
    markerSvgFileName: string;
    markerSvgString: string;
    isPredefined: boolean;
    isPredefinedString: string;
    assetStateFormat: string;
}

interface IAssetTypeColumn extends IAssetType {
    edit: string;
    delete: string;
}

interface DeleteAssetTypeModalProps {
    rowIndex: number;
    orgId: number;
    assetTypeId: number;
    refreshAssetTypes: () => void;
}

const domainName = getDomainName();
const protocol = getProtocol();

const DeleteAssetTypeModal: FC<DeleteAssetTypeModalProps> = ({ rowIndex, orgId, assetTypeId, refreshAssetTypes }) => {
    const plaformAssistantDispatch = usePlatformAssitantDispatch();
    const [isAssetTypeDeleted, setIsAssetTypeDeleted] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const title = "DELETE ASSET TYPE";
    const question = "Are you sure to delete this asset type?";
    const consequences = "Icon and marker svg data are going to be lost.";
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();

    const showLoader = () => {
        setIsSubmitting(true);
    }

    useEffect(() => {
        if (isAssetTypeDeleted) {
            refreshAssetTypes();
        }
    }, [isAssetTypeDeleted, plaformAssistantDispatch, refreshAssetTypes]);

    const action = (hideModal: () => void) => {
        const url = `${protocol}://${domainName}/admin_api/asset_type/${orgId}/id/${assetTypeId}`;
        const config = axiosAuth(accessToken);
        getAxiosInstance(refreshToken, authDispatch)
            .delete(url, config)
            .then((response) => {
                setIsAssetTypeDeleted(true);
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

interface EditAssetTypeProps {
    rowIndex: number;
    assetTypeId: number;
}

const EditAssetType: FC<EditAssetTypeProps> = ({ rowIndex, assetTypeId }) => {
    const assetTypesDispatch = useAssetTypesDispatch()

    const handleClick = () => {
        const assetTypeIdToEdit = { assetTypeIdToEdit: assetTypeId };
        setAssetTypeIdToEdit(assetTypesDispatch, assetTypeIdToEdit);


        const assetTypeRowIndexToEdit = { assetTypeRowIndexToEdit: rowIndex };
        setAssetTypeRowIndexToEdit(assetTypesDispatch, assetTypeRowIndexToEdit);

        const assetTypesOptionToShow = { assetTypesOptionToShow: ASSET_TYPES_OPTIONS.EDIT_ASSET_TYPE };
        setAssetTypesOptionToShow(assetTypesDispatch, assetTypesOptionToShow);
    };


    return (
        <span onClick={handleClick}>
            <EditIcon rowIndex={rowIndex} />
        </span>
    )
}


export const Create_ASSET_TYPES_COLUMNS = (refreshAssetTypes: () => void): Column<IAssetTypeColumn>[] => {
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
            Header: "AssetTypeUid",
            accessor: "assetTypeUid",
            filter: 'equals'
        },
        {
            Header: "Type",
            accessor: "type",
            filter: 'equals'
        },
        {
            Header: () => <div style={{ backgroundColor: '#202226' }}>Geolocation<br />mode</div>,
            accessor: "geolocationMode",
            disableFilters: true,
        },
        {
            Header: "Predefined",
            accessor: "isPredefinedString",
            filter: 'equals'
        },
        {
            Header: "",
            accessor: "edit",
            disableFilters: true,
            disableSortBy: true,
            Cell: props => {
                const rowIndex = parseInt(props.row.id, 10);
                const row = props.rows.filter(row => row.index === rowIndex)[0];
                const assetTypeId = row?.cells[0]?.value;
                return <EditAssetType assetTypeId={assetTypeId} rowIndex={rowIndex} />
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
                const assetTypeId = row?.cells[0]?.value;
                const orgId = row?.cells[1]?.value;
                return <DeleteAssetTypeModal
                    assetTypeId={assetTypeId}
                    orgId={orgId}
                    rowIndex={rowIndex}
                    refreshAssetTypes={refreshAssetTypes}
                />
            }
        }
    ]
}
