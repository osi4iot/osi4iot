import { FC } from 'react';
import { Column } from 'react-table';
import DeleteIcon from '../DeleteIcon';
import Modal from '../Modal';

export interface IRefreshToken {
	id: number;
	userId: string;
    token: string;
    createdAtAge: string;
    updatedAtAge: string;
    delete: string;
}

interface DeleteRefreshTokenModalProps {
    rowIndex: number;
    refreshTokenId: number;
}

const DeleteRefreshTokenModal: FC<DeleteRefreshTokenModalProps> = ({ rowIndex, refreshTokenId }) => {
    const component = "refresh token";
    const consequences = "The user are going to need to sign in again.";
    const action = () => {
        console.log("Delete refresh token with id=", refreshTokenId);;
    }

    const [showModal] = Modal(component, consequences, action);

    return (
        <DeleteIcon action={showModal} rowIndex={rowIndex} />
    )
}

export const REFRESH_TOKENS_COLUMNS: Column<IRefreshToken>[] = [
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
            const refreshTokenId = props.rows[props.row.id as unknown as number]?.cells[0].value;
            const rowIndex = props.rows[props.row.id as unknown as number]?.cells[0].row.id;
            return <DeleteRefreshTokenModal refreshTokenId={refreshTokenId} rowIndex={parseInt(rowIndex)} />
        }
    }
]