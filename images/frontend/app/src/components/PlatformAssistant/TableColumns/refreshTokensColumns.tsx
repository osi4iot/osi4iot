import { FC, useState, useEffect } from 'react';
import { Column } from 'react-table';
import { toast } from 'react-toastify';
import { axiosAuth, getDomainName, axiosInstance } from '../../../tools/tools';
import { useAuthState, useAuthDispatch } from '../../../contexts/authContext';
import DeleteIcon from '../DeleteIcon';
import DeleteModal from '../../Tools/DeleteModal';

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
        const url = `https://${domainName}/admin_api/auth/disable_refresh_token_by_id/${refreshTokenId}`;
        const config = axiosAuth(accessToken);
        axiosInstance(refreshToken, authDispatch)
            .delete(url, config)
            .then((response) => {
                setIsRefreshTokenDeleted(true);
                setIsSubmitting(false);
                const data = response.data;
                toast.success(data.message);
                hideModal();
            })
            .catch((error) => {
                const errorMessage = error.response.data.message;
                toast.error(errorMessage);
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
                const refreshTokenId = props.rows[props.row.id as unknown as number]?.cells[0]?.value;
                const rowIndex = props.rows[props.row.id as unknown as number]?.cells[0]?.row?.id;
                return <DeleteRefreshTokenModal refreshTokenId={refreshTokenId} rowIndex={parseInt(rowIndex)} refreshRefreshTokens={refreshRefreshTokens} />
            }
        }
    ]
}
