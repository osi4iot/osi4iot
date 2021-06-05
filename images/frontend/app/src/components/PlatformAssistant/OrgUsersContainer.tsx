import React, { FC } from 'react'
import TableWithPagination from './TableWithPagination';
import { ORG_USERS_OPTIONS } from './platformAssistantOptions';
import { IOrgUser, Create_ORG_USERS_COLUMNS } from './TableColumns/orgUsersColumns';
import EditOrgUser from './EditOrgUser';
import { useOrgUsersDispatch, useOrgUsersOptionToShow, setOrgUsersOptionToShow } from '../../contexts/orgUsersOptions';

interface OrgUsersContainerProps {
    orgUsers: IOrgUser[];
    refreshOrgUsers: () => void;
}

const OrgUsersContainer: FC<OrgUsersContainerProps> = ({ orgUsers, refreshOrgUsers }) => {
    const orgUsersDispatch = useOrgUsersDispatch();
    const orgUsersOptionToShow = useOrgUsersOptionToShow();

    const showOrgUsersTableOption = () => {
        setOrgUsersOptionToShow(orgUsersDispatch, { orgUsersOptionToShow: ORG_USERS_OPTIONS.TABLE });
    }

    return (
        <>
            {orgUsersOptionToShow === ORG_USERS_OPTIONS.EDIT_ORG_USER &&
                <EditOrgUser
                orgUsers={orgUsers}
                backToTable={showOrgUsersTableOption}
                refreshOrgUsers={refreshOrgUsers}
            />
            }
            {orgUsersOptionToShow === ORG_USERS_OPTIONS.TABLE &&
                <TableWithPagination
                    dataTable={orgUsers}
                    columnsTable={Create_ORG_USERS_COLUMNS(refreshOrgUsers)}
                    componentName=""
                    reloadTable={refreshOrgUsers}
                />
            }
        </>
    )
}

export default OrgUsersContainer;