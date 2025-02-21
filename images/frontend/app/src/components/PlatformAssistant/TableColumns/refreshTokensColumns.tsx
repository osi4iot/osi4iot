import { FC, useState, useEffect } from 'react';
import { Column } from 'react-table';
import { toast } from 'react-toastify';
import { axiosAuth, getDomainName, getProtocol } from '../../../tools/tools';
import { useAuthState, useAuthDispatch } from '../../../contexts/authContext';
import DeleteIcon from '../Utils/DeleteIcon';
import DeleteModal from '../../Tools/DeleteModal';
import { getAxiosInstance } from '../../../tools/axiosIntance';
import axiosErrorHandler from '../../../tools/axiosErrorHandler';
import { AxiosResponse, AxiosError } from 'axios';

export interface IRefreshToken {
    id: number;
    userId: string;
    token: string;
    createdAtAge: string;
    updatedAtAge: string;
}

interface IRefreshTokenColumn extends IRefreshToken {
    delete: string;
}

interface DeleteRefreshTokenModalProps {
    rowIndex: number;
    refreshTokenId: number;
    refreshRefreshTokens: () => void;
}

const domainName = getDomainName();
const protocol = getProtocol();

const DeleteRefreshTokenModal: FC<DeleteRefreshTokenModalProps> = ({ rowIndex, refreshTokenId, refreshRefreshTokens }) => {
    const [isRefreshTokenDeleted, setIsRefreshTokenDeleted] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const title = "DELETE REFRESH TOKEN";
    const question = "Are you sure to delete this refresh token?";
    const consequences = "The user are going to need to sign in again.";
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();

    const showLoader = () => {
        setIsSubmitting(true);
    }

    useEffect(() => {
        if (isRefreshTokenDeleted) {
            refreshRefreshTokens();
        }
    }, [isRefreshTokenDeleted, refreshRefreshTokens]);

    const action = (hideModal: () => void) => {
        const url = `${protocol}://${domainName}/admin_api/auth/disable_refresh_token_by_id/${refreshTokenId}`;
        const config = axiosAuth(accessToken);
        getAxiosInstance(refreshToken, authDispatch)
            .delete(url, config)
            .then((response: AxiosResponse<any, any>) => {
                setIsRefreshTokenDeleted(true);
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

export const Create_REFRESH_TOKENS_COLUMNS = (refreshRefreshTokens: () => void): Column<IRefreshTokenColumn>[] => {
    return [
        {
            Header: "Id",
            accessor: "id",
            filter: 'equals',
        },
        {
            Header: "UserId",
            accessor: "userId",
            filter: 'equals',
        },
        {
            Header: "Refresh tokens",
            accessor: "token"
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
            accessor: "delete",
            disableFilters: true,
            disableSortBy: true,
            Cell: props => {
                const rowIndex = parseInt(props.row.id, 10);
                const row = props.rows.filter(row => row.index === rowIndex)[0];
                const refreshTokenId = row?.cells[0]?.value;
                return <DeleteRefreshTokenModal refreshTokenId={refreshTokenId} rowIndex={rowIndex} refreshRefreshTokens={refreshRefreshTokens} />
            }
        }
    ]
}
