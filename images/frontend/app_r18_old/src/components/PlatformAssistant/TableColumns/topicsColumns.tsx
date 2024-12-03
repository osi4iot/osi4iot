import { FC, useState, useEffect } from 'react';
import { Column } from 'react-table';
import { toast } from 'react-toastify';
import { axiosAuth, getDomainName, getProtocol } from '../../../tools/tools';
import { useAuthState, useAuthDispatch } from '../../../contexts/authContext';
import EditIcon from '../Utils/EditIcon';
import DeleteIcon from '../Utils/DeleteIcon';
import ExChangeIcon from '../Utils/ExchangeIcon';
import DeleteModal from '../../Tools/DeleteModal';
import ChangeModal from '../../Tools/ChangeModal';
import { TOPICS_OPTIONS } from '../Utils/platformAssistantOptions';
import {
    useTopicsDispatch,
    setTopicsOptionToShow,
    setTopicIdToEdit,
    setTopicRowIndexToEdit
} from '../../../contexts/topicsOptions';
import { getAxiosInstance } from '../../../tools/axiosIntance';
import axiosErrorHandler from '../../../tools/axiosErrorHandler';


export interface ITopic {
    id: number;
    orgId: number;
    groupId: number;
    topicType: string;
    description: string;
    topicUid: string;
    mqttAccessControl: string;
}

export interface IMobileTopic {
	id: number;
	orgAcronym: string;
	groupAcronym: string;
    assetDescription: string;
    sensorType: string;
	sensorDescription: string;
	groupUid: string;
	assetUid: string;
	topicUid: string;
}


interface ITopicColumn extends ITopic {
    changeTopicHash: string;
    edit: string;
    delete: string;
}

interface DeleteTopicModalProps {
    rowIndex: number;
    groupId: number;
    topicId: number;
    refreshTopics: () => void;
}

const domainName = getDomainName();
const protocol = getProtocol();

const DeleteTopicModal: FC<DeleteTopicModalProps> = ({ rowIndex, groupId, topicId, refreshTopics }) => {
    const [isTopicDeleted, setIsTopicDeleted] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const title = "DELETE TOPIC";
    const question = "Are you sure to delete this topic?";
    const consequences = "All sensors measurements of this topic are going to be lost.";
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();

    const showLoader = () => {
        setIsSubmitting(true);
    }

    useEffect(() => {
        if (isTopicDeleted) {
            refreshTopics();
        }
    }, [isTopicDeleted, refreshTopics]);

    const action = (hideModal: () => void) => {
        const url = `${protocol}://${domainName}/admin_api/topic/${groupId}/${topicId}`;
        const config = axiosAuth(accessToken);
        getAxiosInstance(refreshToken, authDispatch)
            .delete(url, config)
            .then((response) => {
                setIsTopicDeleted(true);
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

interface EditTopicProps {
    rowIndex: number;
    topicId: number;
}

const EditTopic: FC<EditTopicProps> = ({ rowIndex, topicId }) => {
    const topicsDispatch = useTopicsDispatch()

    const handleClick = () => {
        const topicIdToEdit = { topicIdToEdit: topicId };
        setTopicIdToEdit(topicsDispatch, topicIdToEdit);

        const topicRowIndexToEdit = { topicRowIndexToEdit: rowIndex };
        setTopicRowIndexToEdit(topicsDispatch, topicRowIndexToEdit);

        const topicsOptionToShow = { topicsOptionToShow: TOPICS_OPTIONS.EDIT_TOPIC };
        setTopicsOptionToShow(topicsDispatch, topicsOptionToShow);
    };


    return (
        <span onClick={handleClick}>
            <EditIcon rowIndex={rowIndex} />
        </span>
    )
}

interface ChangeTopicHashModalProps {
    rowIndex: number;
    groupId: number;
    topicId: number;
    refreshTopics: () => void;
}

const ChangeTopicHashModal: FC<ChangeTopicHashModalProps> = ({ rowIndex, groupId, topicId, refreshTopics }) => {
    const [isTopicHashChanged, setIsTopicHashChanged] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const title = "CHANGE TOPIC HASH";
    const question = "Are you sure to change hash of this topic?";
    const consequences = "The mqtt topics of this topic must be change to reference to new the hash. Topic hash used in dashboards are going to be updated automatically.";
    const width = 380;
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();

    const showLoader = () => {
        setIsSubmitting(true);
    }

    useEffect(() => {
        if (isTopicHashChanged) {
            refreshTopics();
        }
    }, [isTopicHashChanged, refreshTopics]);

    const action = (hideModal: () => void) => {
        const url = `${protocol}://${domainName}/admin_api/topic/${groupId}/changeUid/${topicId}`;
        const config = axiosAuth(accessToken);
        getAxiosInstance(refreshToken, authDispatch)
            .patch(url, null, config)
            .then((response) => {
                setIsTopicHashChanged(true);
                setIsSubmitting(false);
                const data = response.data;
                if (data.newTopicUid !== undefined) {
                    const message = "Topic hash changed successfully."
                    toast.success(message);
                }                
                hideModal();
            })
            .catch((error) => {
                axiosErrorHandler(error, authDispatch);
                setIsSubmitting(false);
                hideModal();
            })
    }

    const [showModal] = ChangeModal(title, question, consequences, action, isSubmitting, showLoader, width);

    return (
        <ExChangeIcon action={showModal} rowIndex={rowIndex} />
    )
}

export const Create_TOPICS_COLUMNS = (refreshTopics: () => void): Column<ITopicColumn>[] => {
    return [
        {
            Header: "TopicId",
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
            Header: "Type",
            accessor: "topicType"
        },
        {
            Header: "Description",
            accessor: "description"
        },
        {
            Header: "Mqtt acc",
            accessor: "mqttAccessControl",
            disableFilters: true,
            Cell: props => {
                const rowIndex = parseInt(props.row.id, 10);
                const row = props.rows.filter(row => row.index === rowIndex)[0];
                const mqttAccessControl = row?.cells[5]?.value;
                const style: React.CSSProperties = {
                    color: mqttAccessControl === "None" ? 'red' : 'white'
                };
                return <span style={style}>{mqttAccessControl}</span>;
            }             
        },
        {
            Header: "Topic hash",
            accessor: "topicUid",
            disableFilters: true,
            disableSortBy: true
        },    
        {
            Header: () => <div style={{ backgroundColor: '#202226' }}>Change<br />hash</div>,
            accessor: "changeTopicHash",
            disableFilters: true,
            disableSortBy: true,
            Cell: props => {
                const rowIndex = parseInt(props.row.id, 10);
                const row = props.rows.filter(row => row.index === rowIndex)[0];
                const topicId = row?.cells[0]?.value;
                const groupId = row?.cells[2]?.value;
                return <ChangeTopicHashModal groupId={groupId} topicId={topicId} rowIndex={rowIndex} refreshTopics={refreshTopics} />
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
                const topicId = row?.cells[0]?.value;
                return <EditTopic topicId={topicId} rowIndex={rowIndex} />
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
                const topicId = row?.cells[0]?.value;
                const groupId = row?.cells[2]?.value;
                return <DeleteTopicModal topicId={topicId} groupId={groupId} rowIndex={rowIndex} refreshTopics={refreshTopics} />
            }
        }
    ]
}
