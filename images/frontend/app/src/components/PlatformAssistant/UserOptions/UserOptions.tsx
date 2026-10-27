import { FC, useCallback } from 'react'
import styled from "styled-components";
import Loader from "../../Tools/Loader";
import TableWithPagination from '../Utils/TableWithPagination';
import { MEMBERSHIP_IN_ORGS } from '../TableColumns/membershipInOrgs';
import { MEMBERSHIP_IN_GROUPS } from '../TableColumns/membershipInGroups';
import { USER_OPTIONS } from '../Utils/platformAssistantOptions';
import UserProfile from './UserProfile';
import { reloadTable, usePersistentState, useTable, useTablesPending } from '../../../state';
import { Column } from '../Utils/platformTable';


const ContentContainer = styled.div`
    flex: 1;
    min-height: 0;
    width: 100%;
    box-sizing: border-box;
    background-color: #202226;
    display: flex;
	flex-direction: column;
    justify-content: flex-start;
	align-items: center;
    overflow: auto;

        /* width */
        &::-webkit-scrollbar {
        width: 10px;
        height: 10px;
    }

    /* Track */
    &::-webkit-scrollbar-track {
        background: #202226;
        border-radius: 5px;
    }
    
    /* Handle */
    &::-webkit-scrollbar-thumb {
        background: #2c3235; 
        border-radius: 5px;
    }

    /* Handle on hover */
    &::-webkit-scrollbar-thumb:hover {
        background-color: #343840;
    }

    &::-webkit-scrollbar-corner {
        /* background-color: #0c0d0f; */
        background: #202226;
    }
`;

const UserOptions: FC<{}> = () => {
    // sección abierta: la elige el menú lateral y se conserva al cambiar de capa
    const [optionToShow] = usePersistentState("user.optionToShow", USER_OPTIONS.USER_PROFILE);

    const userProfileTable = useTable("userProfile");
    const orgsMembershipTable = useTable("orgsMembership");
    const groupsMembershipTable = useTable("groupsMembership");
    const loading = useTablesPending(["userProfile", "orgsMembership", "groupsMembership"]);

    const refreshUserProfile = useCallback(() => reloadTable("userProfile"), []);
    const refreshOrgsMembership = useCallback(() => reloadTable("orgsMembership"), []);
    const refreshGroupsMembership = useCallback(() => reloadTable("groupsMembership"), []);


    return (
        <>
            <ContentContainer >
                {loading ?
                    <Loader />
                    :
                    <>
                        {
                            optionToShow === USER_OPTIONS.USER_PROFILE &&
                            <UserProfile userProfile={userProfileTable} refreshUserProfile={refreshUserProfile} />
                        }
                        {
                            optionToShow === USER_OPTIONS.MEMBERSHIP_IN_ORGS
                            &&
                            <TableWithPagination
                                dataTable={orgsMembershipTable}
                                columnsTable={MEMBERSHIP_IN_ORGS as Column<any>[]}
                                reloadTable={refreshOrgsMembership}
                                componentName=""
                            />}
                        {
                            optionToShow === USER_OPTIONS.MEMBERSHIP_IN_GROUPS
                            &&
                            <TableWithPagination
                                dataTable={groupsMembershipTable}
                                columnsTable={MEMBERSHIP_IN_GROUPS as Column<any>[]}
                                reloadTable={refreshGroupsMembership}
                                componentName=""
                            />}
                    </>
                }
            </ContentContainer>
        </>
    )
}

export default UserOptions;
