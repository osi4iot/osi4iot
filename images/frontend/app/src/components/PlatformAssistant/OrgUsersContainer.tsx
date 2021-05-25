import React, { FC } from 'react'
import TableWithPagination from './TableWithPagination';
import { ORG_USERS_OPTIONS } from './platformAssistantOptions';
import { IOrgUser, Create_ORG_USERS_COLUMNS } from './TableColumns/orgUsersColumns';
import EditOrgUser from './EditOrgUser';
import CreateOrgUser from './CreateOrgUser';
import { useOrgUsersDispatch, useOrgUsersOptionToShow, setOrgUsersOptionToShow } from '../../contexts/orgUsers';

interface OrgUsersContainerProps {
    orgUsers: IOrgUser[];
    refreshOrgUsers: () => void;
}

const OrgUsersContainer: FC<OrgUsersContainerProps> = ({ orgUsers, refreshOrgUsers }) => {
    const orgUsersDispatch = useOrgUsersDispatch();
    const orgUsersOptionToShow = useOrgUsersOptionToShow();

    return (
        <>
            {orgUsersOptionToShow === ORG_USERS_OPTIONS.CREATE_ORG_USER && <CreateOrgUser refreshOrgUsers={refreshOrgUsers} />}
            {orgUsersOptionToShow === ORG_USERS_OPTIONS.EDIT_ORG_USER && <EditOrgUser orgUsers={orgUsers} refreshOrgUsers={refreshOrgUsers} />}
            {orgUsersOptionToShow === ORG_USERS_OPTIONS.TABLE &&
                <TableWithPagination
                    dataTable={orgUsers}
                    columnsTable={Create_ORG_USERS_COLUMNS(refreshOrgUsers)}
                    componentName="org user"
                    createComponent={() => setOrgUsersOptionToShow(orgUsersDispatch, { orgUsersOptionToShow: ORG_USERS_OPTIONS.CREATE_ORG_USER })}
                />
            }
        </>
    )
}

export default OrgUsersContainer;