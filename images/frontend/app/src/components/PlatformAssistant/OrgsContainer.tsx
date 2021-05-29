import React, { FC } from 'react'
import { IOrganization, Create_ORGANIZATIONS_COLUMNS } from './TableColumns/organizationsColumns';
import TableWithPagination from './TableWithPagination';
import CreateOrganization from './CreateOrganization';
import EditOrganization from './EditOrganization';
import { ORGS_OPTIONS } from './platformAssistantOptions';
import { useOrgsDispatch, setOrgsOptionToShow, useOrgsOptionToShow } from '../../contexts/orgs';

interface OrgsContainerProps {
    organizations: IOrganization[];
    refreshOrgs: () => void;
}

const OrgsContainer: FC<OrgsContainerProps> = ({ organizations, refreshOrgs }) => {
    const orgsDispatch = useOrgsDispatch();
    const orgsOptionToShow = useOrgsOptionToShow();

    const showOrgsTableOption = () => {
        setOrgsOptionToShow(orgsDispatch, { orgsOptionToShow: ORGS_OPTIONS.TABLE });
    }

    return (
        <>
            {orgsOptionToShow === ORGS_OPTIONS.CREATE_ORG && <CreateOrganization backToTable={showOrgsTableOption} refreshOrgs={refreshOrgs} />}
            {orgsOptionToShow === ORGS_OPTIONS.EDIT_ORG &&
                <EditOrganization
                    organizations={organizations}
                    refreshOrgs={refreshOrgs}
                    backToTable={showOrgsTableOption}
                />
            }
            {orgsOptionToShow === ORGS_OPTIONS.TABLE &&
                <TableWithPagination
                    dataTable={organizations}
                    columnsTable={Create_ORGANIZATIONS_COLUMNS(refreshOrgs)}
                    componentName="organization"
                    createComponent={() => setOrgsOptionToShow(orgsDispatch, { orgsOptionToShow: ORGS_OPTIONS.CREATE_ORG })}
                />
            }
        </>
    )
}

export default OrgsContainer;