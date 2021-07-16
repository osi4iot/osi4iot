import { FC, useState, useEffect } from 'react';
import { FeatureCollection } from 'geojson';
import { Column } from 'react-table';
import { toast } from 'react-toastify';
import EditIcon from '../EditIcon';
import DeleteIcon from '../DeleteIcon';
import DeleteModal from '../../Tools/DeleteModal';
import { axiosAuth, getDomainName, axiosInstance } from '../../../tools/tools';
import { useAuthState, useAuthDispatch } from '../../../contexts/authContext';
import { FLOORS_OPTIONS } from '../platformAssistantOptions';
import { setFloorIdToEdit, setFloorRowIndexToEdit, setFloorsOptionToShow, useFloorsDispatch } from '../../../contexts/floorsOptions';


export interface IFloor {
    id: number;
    buildingId: number;
    buildingName: number;
    floorNumber: number;
    geoJsonData: FeatureCollection;
    outerBounds: number[][];
    timeFromCreation: string;
    timeFromLastUpdate: string;
}

interface IFloorColumn extends IFloor {
    edit: string;
    delete: string;
}

interface DeleteFloorModalProps {
    rowIndex: number;
    floorId: number;
    refreshFloors: () => void;
}

const domainName = getDomainName();

const DeleteFloorModal: FC<DeleteFloorModalProps> = ({ rowIndex, floorId, refreshFloors }) => {
    const [isFloorDeleted, setIsFloorDeleted] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const title = "DELETE FLOOR";
    const question = "Are you sure to delete this floor?";
    const consequences = "The geojson data of the floor are going to be lost.";
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();

    const showLoader = () => {
        setIsSubmitting(true);
    }

    useEffect(() => {
        if (isFloorDeleted) {
            refreshFloors();
        }
    }, [isFloorDeleted, refreshFloors]);

    const action = (hideModal: () => void) => {
        const url = `https://${domainName}/admin_api/building_floor/${floorId}`;
        const config = axiosAuth(accessToken);
        axiosInstance(refreshToken, authDispatch)
            .delete(url, config)
            .then((response) => {
                setIsFloorDeleted(true);
                setIsSubmitting(false);
                const data = response.data;
                toast.success(data.message);
                hideModal();
            })
            .catch((error) => {
                const errorMessage = error.response.data.message;
                toast.error(errorMessage);
                setIsSubmitting(false);
                hideModal();
            })
    }
    const [showModal] = DeleteModal(title, question, consequences, action, isSubmitting, showLoader );


    return (
        <DeleteIcon action={showModal} rowIndex={rowIndex} />
    )
}

interface EditFloorProps {
    rowIndex: number;
    floorId: number;
}

const EditFloor: FC<EditFloorProps> = ({ rowIndex, floorId }) => {
    const floorsDispatch = useFloorsDispatch();

    const handleClick = () => {
        const floorIdToEdit = { floorIdToEdit: floorId };
        setFloorIdToEdit(floorsDispatch, floorIdToEdit);

        const floorRowIndexToEdit = { floorRowIndexToEdit: rowIndex };
        setFloorRowIndexToEdit(floorsDispatch, floorRowIndexToEdit);

        const floorsOptionToShow = { floorsOptionToShow: FLOORS_OPTIONS.EDIT_FLOOR };
        setFloorsOptionToShow(floorsDispatch, floorsOptionToShow);
    };


    return (
        <span onClick={handleClick}>
            <EditIcon rowIndex={rowIndex} />
        </span>
    )
}


export const Create_FLOORS_COLUMNS = (refreshFloors: () => void): Column<IFloorColumn>[] => {
    return [
        {
            Header: "Id",
            accessor: "id",
            filter: 'equals'
        },
        {
            Header: "Building Id",
            accessor: "buildingId"
        },
        {
            Header: "Building name",
            accessor: "buildingName"
        },
        {
            Header: "Floor number",
            accessor: "floorNumber"
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
            Header: "Time from creation",
            accessor: "timeFromCreation",
            disableFilters: true,
        },
        {
            Header: "Time from last update",
            accessor: "timeFromLastUpdate",
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
                const floorId = row?.cells[0]?.value;
                return <EditFloor floorId={floorId} rowIndex={rowIndex} />
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
                const floorId = row?.cells[0]?.value;
                return <DeleteFloorModal floorId={floorId} rowIndex={rowIndex} refreshFloors={refreshFloors} />
            }
        }
    ]
}