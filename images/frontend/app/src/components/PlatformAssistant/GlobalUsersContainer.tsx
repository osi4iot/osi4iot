import React, { FC } from 'react'
import { Create_GLOBAL_USERS_COLUMNS, IGlobalUser } from "./TableColumns/globalUsersColumns";
import TableWithPagination from './TableWithPagination';
import { GLOBAL_USERS_OPTIONS } from './platformAssistantOptions';
import CreateGlobalUser from './CreateGlobalUser';
import EditGlobalUser from './EditGlobalUser';
import { useGlobalUsersDispatch, useGlobalUsersOptionToShow, setGlobalUsersOptionToShow } from '../../contexts/globalUsers';


interface GlobalUsersContainerProps {
    globalUsers: IGlobalUser[];
    refreshGlobalUsers: () => void;
}

const GlobalUsersContainer: FC<GlobalUsersContainerProps> = ({ globalUsers, refreshGlobalUsers }) => {
    const globalUsersDispatch = useGlobalUsersDispatch();
    const globalUsersOptionToShow = useGlobalUsersOptionToShow();

    return (
        <>

            { globalUsersOptionToShow === GLOBAL_USERS_OPTIONS.CREATE_GLOBAL_USER && <CreateGlobalUser refreshGlobalUsers={refreshGlobalUsers} />}
            { globalUsersOptionToShow === GLOBAL_USERS_OPTIONS.EDIT_GLOBAL_USER && <EditGlobalUser refreshGlobalUsers={refreshGlobalUsers} />}
            { globalUsersOptionToShow === GLOBAL_USERS_OPTIONS.TABLE &&
                <TableWithPagination
                    dataTable={globalUsers}
                    columnsTable={Create_GLOBAL_USERS_COLUMNS(refreshGlobalUsers)}
                    componentName="global user"
                    createComponent={() => setGlobalUsersOptionToShow(globalUsersDispatch, { globalUsersOptionToShow: GLOBAL_USERS_OPTIONS.CREATE_GLOBAL_USER })}
                />
            }

        </>
    )
}

export default GlobalUsersContainer;
