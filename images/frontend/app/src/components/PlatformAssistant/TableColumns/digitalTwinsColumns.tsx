import { FC, useState, useEffect } from 'react';
import { Column } from 'react-table';
import { toast } from 'react-toastify';
import { axiosAuth, getDomainName, getProtocol } from '../../../tools/tools';
import { useAuthState, useAuthDispatch } from '../../../contexts/authContext';
import EditIcon from '../Utils/EditIcon';
import DeleteIcon from '../Utils/DeleteIcon';
import DeleteModal from '../../Tools/DeleteModal';
import { DIGITAL_TWINS_OPTIONS } from '../Utils/platformAssistantOptions';
import {
    setDigitalTwinIdToEdit,
    setDigitalTwinRowIndexToEdit,
    setDigitalTwinsOptionToShow,
    useDigitalTwinsDispatch
} from '../../../contexts/digitalTwinsOptions';
import { DigitalTwinSimulationParameter } from '../DigitalTwin3DViewer/ViewerUtils';
import {
    setReloadDashboardsTable,
    setReloadSensorsTable,
    setReloadTopicsTable,
    usePlatformAssitantDispatch
} from '../../../contexts/platformAssistantContext';
import { getAxiosInstance } from '../../../tools/axiosIntance';
import axiosErrorHandler from '../../../tools/axiosErrorHandler';
import RemoveDTLocalStorageIcon from '../Utils/RemoveDTLocalStorageIcon';
import { removeDTStoragebyUid } from '../../../tools/fileSystem';
import { AxiosResponse, AxiosError } from 'axios';

export interface IDigitalTwin {
    id: number;
    orgId: number;
    groupId: number;
    assetId: number;
    digitalTwinUid: string;
    description: string;
    type: string;
    dashboardId: string;
    gltfFileName: string;
    gltfFileLastModifDateString: string;
    femSimDataFileName: string;
    femSimDataFileLastModifDateString: string;
    maxNumResFemFiles: number;
    chatAssistantEnabled: boolean;
    chatAssistantLanguage: string;
    digitalTwinSimulationFormat: string;
    dashboardUrl: string;
    digitalTwinRef: string;
    sensorsRef: string[];
    numGltfFilesLocallyStored: number;
    numFemResFilesLocallyStored: number;
}

export interface IDigitalTwinSimulator {
    id: number;
    orgAcronym: string;
    groupAcronym: string;
    groupId: string;
    assetUid: string;
    assetDescription: string;
    digitalTwinUid: string;
    digitalTwinDescription: string;
    description: string;
    digitalTwinSimulationFormat: Record<string, DigitalTwinSimulationParameter>;
    sensorSimulationTopicId: number;
    mqttTopic: string;
}


interface IDigitalTwinColumn extends IDigitalTwin {
    removeLocalStorage: string;
    edit: string;
    delete: string;
}

interface DeleteDigitalTwinModalProps {
    rowIndex: number;
    groupId: number;
    digitalTwinId: number;
    refreshDigitalTwins: () => void;
}

const domainName = getDomainName();
const protocol = getProtocol();

const DeleteDigitalTwinModal: FC<DeleteDigitalTwinModalProps> = ({ rowIndex, groupId, digitalTwinId, refreshDigitalTwins }) => {
    const plaformAssistantDispatch = usePlatformAssitantDispatch();
    const [isDigitalTwinDeleted, setIsDigitalTwinDeleted] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const title = "DELETE DIGITAL TWIN";
    const question = "Are you sure to delete this digital twin?";
    const consequences = "The visual presentation of this digital twin is going to be lost.";
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();

    const showLoader = () => {
        setIsSubmitting(true);
    }

    useEffect(() => {
        if (isDigitalTwinDeleted) {
            refreshDigitalTwins();
            const reloadTopicsTable = true;
            setReloadTopicsTable(plaformAssistantDispatch, { reloadTopicsTable });
            const reloadSensorsTable = true;
            setReloadSensorsTable(plaformAssistantDispatch, { reloadSensorsTable });
            const reloadDashboardsTable = true;
            setReloadDashboardsTable(plaformAssistantDispatch, { reloadDashboardsTable });

        }
    }, [isDigitalTwinDeleted, plaformAssistantDispatch, refreshDigitalTwins]);

    const action = (hideModal: () => void) => {
        const url = `${protocol}://${domainName}/admin_api/digital_twin/${groupId}/${digitalTwinId}`;
        const config = axiosAuth(accessToken);
        getAxiosInstance(refreshToken, authDispatch)
            .delete(url, config)
            .then((response: AxiosResponse<any, any>) => {
                setIsDigitalTwinDeleted(true);
                setIsSubmitting(false);
                const data = response.data;
                toast.success(data.message);
                hideModal();

            })
            .catch((error: AxiosError) => {
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

interface EditDigitalTwinProps {
    rowIndex: number;
    digitalTwinId: number;
}

const EditDigitalTwin: FC<EditDigitalTwinProps> = ({ rowIndex, digitalTwinId }) => {
    const digitalTwinsDispatch = useDigitalTwinsDispatch()

    const handleClick = () => {
        const digitalTwinIdToEdit = { digitalTwinIdToEdit: digitalTwinId };
        setDigitalTwinIdToEdit(digitalTwinsDispatch, digitalTwinIdToEdit);

        const digitalTwinRowIndexToEdit = { digitalTwinRowIndexToEdit: rowIndex };
        setDigitalTwinRowIndexToEdit(digitalTwinsDispatch, digitalTwinRowIndexToEdit);

        const digitalTwinsOptionToShow = { digitalTwinsOptionToShow: DIGITAL_TWINS_OPTIONS.EDIT_DIGITAL_TWIN };
        setDigitalTwinsOptionToShow(digitalTwinsDispatch, digitalTwinsOptionToShow);
    };


    return (
        <span onClick={handleClick}>
            <EditIcon rowIndex={rowIndex} />
        </span>
    )
}


interface RemoveDTLocalStorageModalProps {
    rowIndex: number;
    digitalTwinUid: string;
    numGltfFilesLocallyStored: number;
    numFemResFilesLocallyStored: number;
    refreshDigitalTwins: () => void;
}

const RemoveDTLocalStorageModal: FC<RemoveDTLocalStorageModalProps> = ({
    rowIndex,
    digitalTwinUid,
    numGltfFilesLocallyStored,
    numFemResFilesLocallyStored,
    refreshDigitalTwins
}) => {
    const [isDigitalTwinDeleted, setIsDigitalTwinDeleted] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const title = "DELETE LOCALLY STORED DT DATA";
    const question = "Are you sure to delete this data";
    const consequences = "The digital twin data need to be reload and it can take time.";
    const width = 400;

    const showLoader = () => {
        setIsSubmitting(true);
    }

    useEffect(() => {
        if (isDigitalTwinDeleted) {
            refreshDigitalTwins();
        }
    }, [isDigitalTwinDeleted, refreshDigitalTwins]);

    const action = (hideModal: () => void) => {
        removeDTStoragebyUid(digitalTwinUid)
            .then((response:any) => {
                setIsDigitalTwinDeleted(true);
                setIsSubmitting(false);
                toast.success(response);
                hideModal();

            })
            .catch((error: any) => {
                setIsSubmitting(false);
                hideModal();
            })
    }

    const [showModal] = DeleteModal(
        title,
        question,
        consequences,
        action,
        isSubmitting,
        showLoader,
        width,
    );

    return (
        <RemoveDTLocalStorageIcon
            action={showModal}
            rowIndex={rowIndex}
            numGltfFilesLocallyStored={numGltfFilesLocallyStored}
            numFemResFilesLocallyStored={numFemResFilesLocallyStored}
        />
    )
}


export const Create_DIGITAL_TWINS_COLUMNS = (refreshDigitalTwins: () => void): Column<IDigitalTwinColumn>[] => {
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
            Header: "AssetId",
            accessor: "assetId",
            filter: 'equals'
        },
        {
            Header: "Reference",
            accessor: "digitalTwinRef"
        },
        {
            Header: "Description",
            accessor: "description"
        },
        {
            Header: "Type",
            accessor: "type",
            disableFilters: true,
            disableSortBy: true
        },
        {
            Header: "DashboardId",
            accessor: "dashboardId",
            disableFilters: true,
        },
        {
            Header: "gltfFileName",
            accessor: "gltfFileName",
            disableFilters: true,
        },
        {
            Header: "gltfFileLastModifDateString",
            accessor: "gltfFileLastModifDateString",
            disableFilters: true,
        },
        {
            Header: "femSimDataFileName",
            accessor: "femSimDataFileName",
            disableFilters: true,
        },
        {
            Header: "femSimDataFileLastModifDateString",
            accessor: "femSimDataFileLastModifDateString",
            disableFilters: true,
        },
        {
            Header: "maxNumResFemFiles",
            accessor: "maxNumResFemFiles",
            disableFilters: true,
        },
        {
            Header: "digitalTwinSimulationFormat",
            accessor: "digitalTwinSimulationFormat",
            disableFilters: true
        },
        {
            Header: () => <div style={{ backgroundColor: '#202226' }}>Nº 3D files<br />locally <br />stored</div>,
            accessor: "numGltfFilesLocallyStored",
            disableFilters: true
        },
        {
            Header: () => <div style={{ backgroundColor: '#202226' }}>Nº res files<br />locally <br />stored</div>,
            accessor: "numFemResFilesLocallyStored",
            disableFilters: true
        },
        {
            Header: "",
            accessor: "removeLocalStorage",
            disableFilters: true,
            disableSortBy: true,
            Cell: props => {
                const rowIndex = parseInt(props.row.id, 10);
                const row = props.rows.filter(row => row.index === rowIndex)[0];
                const dtReference = row?.cells[4]?.value;
                const digitalTwinUid = dtReference.split("_")[1];
                const numGltfFilesLocallyStored = row?.cells[7]?.value;
                const numFemResFilesLocallyStored = row?.cells[8]?.value;
                return <RemoveDTLocalStorageModal
                    digitalTwinUid={digitalTwinUid}
                    numGltfFilesLocallyStored={numGltfFilesLocallyStored}
                    numFemResFilesLocallyStored={numFemResFilesLocallyStored}
                    rowIndex={rowIndex}
                    refreshDigitalTwins={refreshDigitalTwins}
                />
            }
        },
        {
            Header: "",
            accessor: "edit",
            disableFilters: true,
            disableSortBy: true,
            Cell: props => {
                const rowIndex = parseInt(props.row.id, 10);
                const row = props.rows.filter(row => row.index === rowIndex)[0];
                const digitalTwinId = row?.cells[0]?.value;
                return <EditDigitalTwin digitalTwinId={digitalTwinId} rowIndex={rowIndex} />
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
                const digitalTwinId = row?.cells[0]?.value;
                const groupId = row?.cells[2]?.value;
                return <DeleteDigitalTwinModal digitalTwinId={digitalTwinId} groupId={groupId} rowIndex={rowIndex} refreshDigitalTwins={refreshDigitalTwins} />
            }
        }
    ]
}
