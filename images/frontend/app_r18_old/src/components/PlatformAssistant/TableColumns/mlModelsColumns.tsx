import { FC, useState, useEffect } from 'react';
import { Column } from 'react-table';
import { toast } from 'react-toastify';
import { axiosAuth, getDomainName, getProtocol } from '../../../tools/tools';
import { useAuthState, useAuthDispatch } from '../../../contexts/authContext';
import EditIcon from '../Utils/EditIcon';
import DeleteIcon from '../Utils/DeleteIcon';
import DeleteModal from '../../Tools/DeleteModal';
import { ML_MODELS_OPTIONS } from '../Utils/platformAssistantOptions';
import { getAxiosInstance } from '../../../tools/axiosIntance';
import axiosErrorHandler from '../../../tools/axiosErrorHandler';
import { setMlModelIdToEdit, setMlModelRowIndexToEdit, setMlModelsOptionToShow, useMlModelsDispatch } from '../../../contexts/mlModelsOptions';

export interface IMlModel {
    id: number;
    orgId: number;
    groupId: number;
    mlModelUid: string;
    description: string;
    modelJsonFileName: string;
    modelJsonFileLastModifDateString: string;
    modelBinFileName: string;
    modelBinFileLastModifDateString: string;
}


interface IMlModelColumn extends IMlModel {
    edit: string;
    delete: string;
}

interface DeleteMlModelModalProps {
    rowIndex: number;
    groupId: number;
    mlModelId: number;
    refreshMlModels: () => void;
}

const domainName = getDomainName();
const protocol = getProtocol();

const DeleteMlModelModal: FC<DeleteMlModelModalProps> = ({ rowIndex, groupId, mlModelId, refreshMlModels }) => {
    const [isMlModelDeleted, setIsMlModelDeleted] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const title = "DELETE ML MODEL";
    const question = "Are you sure to delete this ml model?";
    const consequences = "The visual presentation of this ml model is going to be lost.";
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();

    const showLoader = () => {
        setIsSubmitting(true);
    }

    useEffect(() => {
        if (isMlModelDeleted) {
            refreshMlModels();
        }
    }, [isMlModelDeleted, refreshMlModels]);

    const action = (hideModal: () => void) => {
        const url = `${protocol}://${domainName}/admin_api/ml_model/${groupId}/${mlModelId}`;
        const config = axiosAuth(accessToken);
        getAxiosInstance(refreshToken, authDispatch)
            .delete(url, config)
            .then((response) => {
                setIsMlModelDeleted(true);
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

interface EditMlModelProps {
    rowIndex: number;
    mlModelId: number;
}

const EditMlModel: FC<EditMlModelProps> = ({ rowIndex, mlModelId }) => {
    const mlModelsDispatch = useMlModelsDispatch()

    const handleClick = () => {
        const mlModelIdToEdit = { mlModelIdToEdit: mlModelId };
        setMlModelIdToEdit(mlModelsDispatch, mlModelIdToEdit);

        const mlModelRowIndexToEdit = { mlModelRowIndexToEdit: rowIndex };
        setMlModelRowIndexToEdit(mlModelsDispatch, mlModelRowIndexToEdit);

        const mlModelsOptionToShow = { mlModelsOptionToShow: ML_MODELS_OPTIONS.EDIT_ML_MODEL };
        setMlModelsOptionToShow(mlModelsDispatch, mlModelsOptionToShow);
    };


    return (
        <span onClick={handleClick}>
            <EditIcon rowIndex={rowIndex} />
        </span>
    )
}


export const Create_ML_MODELS_COLUMNS = (refreshMlModels: () => void): Column<IMlModelColumn>[] => {
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
            Header: "Reference",
            accessor: "mlModelUid"
        },
        {
            Header: "Description",
            accessor: "description"
        },
        {
            Header: "modelJsonFileName",
            accessor: "modelJsonFileName",
            disableFilters: true,
        }, 
        {
            Header: "modelJsonFileLastModifDateString",
            accessor: "modelJsonFileLastModifDateString",
            disableFilters: true,
        },
        {
            Header: "modelBinFileName",
            accessor: "modelBinFileName",
            disableFilters: true,
        }, 
        {
            Header: "modelBinFileLastModifDateString",
            accessor: "modelBinFileLastModifDateString",
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
                const mlModelId = row?.cells[0]?.value;
                return <EditMlModel mlModelId={mlModelId} rowIndex={rowIndex} />
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
                const mlModelId = row?.cells[0]?.value;
                const groupId = row?.cells[1]?.value;
                return <DeleteMlModelModal
                    mlModelId={mlModelId}
                    groupId={groupId}
                    rowIndex={rowIndex}
                    refreshMlModels={refreshMlModels}
                />
            }
        }
    ]
}
