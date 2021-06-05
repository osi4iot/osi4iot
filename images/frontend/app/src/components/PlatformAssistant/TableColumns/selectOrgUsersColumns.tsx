import { Column } from 'react-table';

export interface ISelectOrgUser {
    userId: number;
    firstName: string;
    surname: string;
    email: string;
}

export const SELECT_GLOBAL_USERS: Column<ISelectOrgUser>[] = [
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