import { FC, useState, useEffect } from 'react';
import { Column } from 'react-table';
import { FeatureCollection } from 'geojson';
import { toast } from 'react-toastify';
import EditIcon from '../Utils/EditIcon';
import DeleteIcon from '../Utils/DeleteIcon';
import DeleteModal from '../../Tools/DeleteModal';
import { axiosAuth, getDomainName, getProtocol } from '../../../tools/tools';
import { useAuthState, useAuthDispatch } from '../../../contexts/authContext';
import { BUILDINGS_OPTIONS } from '../Utils/platformAssistantOptions';
import {
    setBuildingIdToEdit,
    setBuildingRowIndexToEdit,
    setBuildingsOptionToShow,
    useBuildingsDispatch
} from '../../../contexts/buildingsOptions';
import {
    setReloadFloorsTable,
    usePlatformAssitantDispatch
} from '../../../contexts/platformAssistantContext';
import { getAxiosInstance } from '../../../tools/axiosIntance';
import axiosErrorHandler from '../../../tools/axiosErrorHandler';
import { AxiosResponse, AxiosError } from 'axios';


export interface IBuilding {
    id: number;
    name: string;
    latitude: number;
    longitude: number;
    geoJsonData: FeatureCollection;
    outerBounds: number[][];
    address: string;
    city: string;
    zipCode: string;
    state: string;
    country: string;
    buildingFileName: string;
	buildingFileLastModifDate: string;
    createdAtAge: string;
    updatedAtAge: string;
}

interface IBuildingColumn extends IBuilding {
    edit: string;
    delete: string;
}

interface DeleteBuildingModalProps {
    rowIndex: number;
    buildingId: number;
    refreshBuildings: () => void;
}

const domainName = getDomainName();
const protocol = getProtocol();

const DeleteBuildingModal: FC<DeleteBuildingModalProps> = ({ rowIndex, buildingId, refreshBuildings }) => {
    const plaformAssistantDispatch = usePlatformAssitantDispatch();
    const [isBuildingDeleted, setIsBuildingDeleted] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const title = "DELETE BUILDING";
    const question = "Are you sure to delete this building?";
    const consequences = "The geojson data of the building and all the floors data are going to be lost.";
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();

    const showLoader = () => {
        setIsSubmitting(true);
    }

    useEffect(() => {
        if (isBuildingDeleted) {
            refreshBuildings();
        }
    }, [isBuildingDeleted, refreshBuildings]);

    const action = (hideModal: () => void) => {
        const url = `${protocol}://${domainName}/admin_api/building/${buildingId}`;
        const config = axiosAuth(accessToken);
        getAxiosInstance(refreshToken, authDispatch)
            .delete(url, config)
            .then((response: AxiosResponse<any, any>) => {
                setIsBuildingDeleted(true);
                setIsSubmitting(false);
                const data = response.data;
                toast.success(data.message);
                const reloadFloorsTable = true;
                setReloadFloorsTable(plaformAssistantDispatch, { reloadFloorsTable });
                hideModal();
            })
            .catch((error: AxiosError) => {
                axiosErrorHandler(error, authDispatch);
                setIsSubmitting(false);
                hideModal();
            })
    }
    const [showModal] = DeleteModal(title, question, consequences, action, isSubmitting, showLoader );


    return (
        <DeleteIcon action={showModal} rowIndex={rowIndex} />
    )
}

interface EditBuildingProps {
    rowIndex: number;
    buildingId: number;
}

const EditBuilding: FC<EditBuildingProps> = ({ rowIndex, buildingId }) => {
    const buildingsDispatch = useBuildingsDispatch();

    const handleClick = () => {
        const buildingIdToEdit = { buildingIdToEdit: buildingId };
        setBuildingIdToEdit(buildingsDispatch, buildingIdToEdit);

        const buildingRowIndexToEdit = { buildingRowIndexToEdit: rowIndex };
        setBuildingRowIndexToEdit(buildingsDispatch, buildingRowIndexToEdit);

        const buildingsOptionToShow = { buildingsOptionToShow: BUILDINGS_OPTIONS.EDIT_BUILDING };
        setBuildingsOptionToShow(buildingsDispatch, buildingsOptionToShow);
    };


    return (
        <span onClick={handleClick}>
            <EditIcon rowIndex={rowIndex} />
        </span>
    )
}


export const Create_BUILDINGS_COLUMNS = (refreshBuildings: () => void): Column<IBuildingColumn>[] => {
    return [
        {
            Header: "Id",
            accessor: "id",
            filter: 'equals'
        },
        {
            Header: "Name",
            accessor: "name"
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
            Header: "Geojson Data",
            accessor: "geoJsonData",
            disableFilters: true
        },
        {
            Header: "outerBounds",
            accessor: "outerBounds",
            disableFilters: true
        },
        {
            Header: "Address",
            accessor: "address",
            disableFilters: true
        },
        {
            Header: "City",
            accessor: "city",
            disableFilters: true
        },
        {
            Header: "Zip code",
            accessor: "zipCode",
            disableFilters: true
        },
        {
            Header: "State",
            accessor: "state",
            disableFilters: true
        },
        {
            Header: "Country",
            accessor: "country",
            disableFilters: true
        },        
        {
            Header: "Created",
            accessor: "createdAtAge",
            disableFilters: true,
        },
        {
            Header: "Updated",
            accessor: "updatedAtAge",
            disableFilters: true,
        },       
        {
            Header: "",
            accessor: "edit",
            disableFilters: true,
            disableSortBy: true,
            Cell: props => {
                const rowIndex = parseInt(props.row.id, 10);
                const row = props.rows.filter(row => row.index === rowIndex)[0];
                const buildingId = row?.cells[0]?.value;
                return <EditBuilding buildingId={buildingId} rowIndex={rowIndex} />
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
                const buildingId = row?.cells[0]?.value;
                return <DeleteBuildingModal buildingId={buildingId} rowIndex={rowIndex} refreshBuildings={refreshBuildings} />
            }
        }
    ]
}