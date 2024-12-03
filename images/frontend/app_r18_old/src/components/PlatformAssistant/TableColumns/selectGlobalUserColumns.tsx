import { Column } from 'react-table';

export interface ISelectGlobalUser {
    id: number;
    firstName: string;
    surname: string;
    email: string;
    login: string;
}

export const SELECT_GLOBAL_USERS: Column<ISelectGlobalUser>[] = [
    {
        Header: "UserId",
        accessor: "id",
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
    {
        Header: "Username",
        accessor: "login"
    }, 
]