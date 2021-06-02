import { Column } from 'react-table';

export interface ISelectUser {
    userId: number;
    firstName: string;
    surname: string;
    email: string;
}

export const SELECT_USERS: Column<ISelectUser>[] = [
    {
        Header: "UserId",
        accessor: "userId",
        filter: 'equals'
    },
    {
        Header: "First Name",
        accessor: "firstName"
    },
    {
        Header: "Surname",
        accessor: "surname"
    },
    {
        Header: "Email",
        accessor: "email"
    },
]