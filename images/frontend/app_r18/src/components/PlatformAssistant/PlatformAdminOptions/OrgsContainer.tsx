import React, { FC } from 'react'
import { IOrganization, Create_ORGANIZATIONS_COLUMNS } from '../TableColumns/organizationsColumns';
import TableWithPagination from '../Utils/TableWithPagination';


interface OrgsContainerProps {
    organizations: IOrganization[];
    refreshOrgs: () => void;
}

const OrgsContainer: FC<OrgsContainerProps> = ({ organizations, refreshOrgs }) => {
    return (
        <TableWithPagination
            dataTable={organizations}
            columnsTable={Create_ORGANIZATIONS_COLUMNS()}
            componentName=""
            reloadTable={refreshOrgs}
        />
    )
}

export default OrgsContainer;