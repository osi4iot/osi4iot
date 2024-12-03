import { Column } from 'react-table';

export interface IOrganization {
    id: number;
    name: string;
    acronym: string;
    role: string;
    city: string;
    country: string;
    buildingId: string;
    orgHash: string;
    mqttAccessControl: string;
}

interface IOrganizationColumn extends IOrganization {
    edit: string;
    delete: string;
}


export const Create_ORGANIZATIONS_COLUMNS = (): Column<IOrganizationColumn>[] => {
    return [
        {
            Header: "Id",
            accessor: "id",
            filter: 'equals'
        },
        {
            Header: "Name",
            accessor: "name"
        },
        {
            Header: "Acronym",
            accessor: "acronym"
        },
        {
            Header: "Role",
            accessor: "role"
        },        
        {
            Header: "Building Id",
            accessor: "buildingId",
            disableFilters: true
        },
        {
            Header: "Org hash",
            accessor: "orgHash",
            disableFilters: true
        },
        {
            Header: "Mqtt acc",
            accessor: "mqttAccessControl",
            disableFilters: true,
            Cell: props => {
                const rowIndex = parseInt(props.row.id, 10);
                const row = props.rows.filter(row => row.index === rowIndex)[0];
                const mqttAccessControl = row?.cells[6]?.value;
                const style: React.CSSProperties = {
                    color: mqttAccessControl === "None" ? 'red' : 'white'
                };
                return <span style={style}>{mqttAccessControl}</span>;
            }             
        }
    ]
}