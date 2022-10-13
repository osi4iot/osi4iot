import { Column } from 'react-table';

export interface IOrganization {
    id: number;
    name: string;
    acronym: string;
    address: string;
    city: string;
    zipCode: string;
    state: string;
    country: string;
    buildingId: string;
    orgHash: string;
    mqttActionAllowed: string;
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
            Header: "Address",
            accessor: "address",
            disableFilters: true
        },
        {
            Header: "City",
            accessor: "city",
            disableFilters: true
        },
        {
            Header: "Zip code",
            accessor: "zipCode",
            disableFilters: true
        },
        {
            Header: "State",
            accessor: "state",
            disableFilters: true
        },
        {
            Header: "Country",
            accessor: "country",
            disableFilters: true
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
            accessor: "mqttActionAllowed",
            disableFilters: true,
            Cell: props => {
                const rowIndex = parseInt(props.row.id, 10);
                const row = props.rows.filter(row => row.index === rowIndex)[0];
                const mqttActionAllowed = row?.cells[10]?.value;
                const style: React.CSSProperties = {
                    color: mqttActionAllowed === "None" ? 'red' : 'white'
                };
                return <span style={style}>{mqttActionAllowed}</span>;
            }             
        }
    ]
}