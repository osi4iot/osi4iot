import React, { FC, useEffect, useState, useCallback } from 'react'
import styled from "styled-components";
import { axiosAuth, getDomainName, axiosInstance } from '../../../tools/tools';
import { useAuthState, useAuthDispatch } from '../../../contexts/authContext';
import Loader from "../../Tools/Loader";
import TableWithPagination from '../Utils/TableWithPagination';
import { MEMBERSHIP_IN_ORGS } from '../TableColumns/membershipInOrgs';
import { MEMBERSHIP_IN_GROUPS } from '../TableColumns/membershipInGroups';
import { USER_OPTIONS } from '../Utils/platformAssistantOptions';
import UserProfile from './UserProfile';
import {
    usePlatformAssitantDispatch,
    setUserProfileTable,
    setOrgsMembershipTable,
    setGroupsMembershipTable,
    useUserProfileTable,
    useOrgsMembershipTable,
    useGroupsMembershipTable,
    useReloadOrgsMembershipTable,
    useReloadGroupsMembershipTable,
    setReloadOrgsMembershipTable,
    setReloadGroupsMembershipTable,
} from '../../../contexts/platformAssistantContext';


const UserOptionsContainer = styled.div`
	display: flex;
	flex-direction: row;
    justify-content: flex-start;
	align-items: center;
    width: 60%;
    height: 50px;
    background-color: #0c0d0f;
`;

interface OptionContainerProps {
    isOptionActive: boolean;
}

const OptionContainer = styled.div<OptionContainerProps>`
	color: "white";
    margin: 10px 20px 0 20px;
    background-color: ${(props) => props.isOptionActive ? "#202226" : "#0c0d0f"};
    padding: 10px 10px 10px 10px;
    border-top: ${(props) => props.isOptionActive ? "3px solid #3274d9;" : "3px solid #0c0d0f"};
    align-content: center;

    &:hover {
        cursor: pointer;
        background-color: #202226;
        border-top: ${(props) => props.isOptionActive ? "3px solid #3274d9;" : "3px solid white"};
    }
`;

const ContentContainer = styled.div`
    width: calc(100vw - 75px);
    height: calc(100vh - 200px);
    background-color: #202226;
    margin-bottom: 5px;
    display: flex;
	flex-direction: column;
    justify-content: flex-start;
	align-items: center;
    overflow: auto;

        /* width */
        ::-webkit-scrollbar {
        width: 10px;
        height: 10px;
    }

    /* Track */
    ::-webkit-scrollbar-track {
        background: #202226;
        border-radius: 5px;
    }
    
    /* Handle */
    ::-webkit-scrollbar-thumb {
        background: #2c3235; 
        border-radius: 5px;
    }

    /* Handle on hover */
    ::-webkit-scrollbar-thumb:hover {
        background-color: #343840;
    }

    ::-webkit-scrollbar-corner {
        /* background-color: #0c0d0f; */
        background: #202226;
    }
`;

const domainName = getDomainName();

const UserOptions: FC<{}> = () => {
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();
    const plaformAssistantDispatch = usePlatformAssitantDispatch();
    const [optionToShow, setOptionToShow] = useState(USER_OPTIONS.USER_PROFILE);

    const userProfileTable = useUserProfileTable();
    const orgsMembershipTable = useOrgsMembershipTable();
    const groupsMembershipTable = useGroupsMembershipTable();

    const [userProfileLoading, setUserProfileLoading] = useState(true);
    const [loadingOrgsMembership, setLoadingOrgsMembership] = useState(true);
    const [loadingGroupsMembership, setLoadinGroupsMembership] = useState(true);

    const [reloadUserProfile, setReloadUserProfile] = useState(false);
    const reloadOrgsMembershipTable = useReloadOrgsMembershipTable();
    const reloadGroupsMembershipTable = useReloadGroupsMembershipTable();

    const refreshUserProfile = useCallback(() => {
        setReloadUserProfile(true);
        setUserProfileLoading(true);
        setTimeout(() => setReloadUserProfile(false), 500);
    }, []);

    const refreshOrgsMembership = useCallback(() => {
        setLoadingOrgsMembership(true);
        const reloadOrgsMembershipTable = true;
        setReloadOrgsMembershipTable(plaformAssistantDispatch, { reloadOrgsMembershipTable });
    }, [plaformAssistantDispatch]);


    const refreshGroupsMembership = useCallback(() => {
        setLoadinGroupsMembership(true);
        const reloadGroupsMembershipTable = true;
        setReloadGroupsMembershipTable(plaformAssistantDispatch, { reloadGroupsMembershipTable });
    }, [plaformAssistantDispatch]);
    
    useEffect(() => {
        if (userProfileTable.userId === 0 || reloadUserProfile) {
            const config = axiosAuth(accessToken);
            const urlUserProfile = `https://${domainName}/admin_api/auth/user_profile`;
            axiosInstance(refreshToken, authDispatch)
                .get(urlUserProfile, config)
                .then((response) => {
                    const userProfile = response.data;
                    setUserProfileTable(plaformAssistantDispatch, { userProfile });
                    setUserProfileLoading(false);
                })
                .catch((error) => {
                    console.log(error);
                });
        } else {
            setUserProfileLoading(false);
        }

    }, [accessToken, refreshToken, authDispatch, plaformAssistantDispatch, reloadUserProfile, userProfileTable.userId]);

    useEffect(() => {
        if (orgsMembershipTable.length === 0 || reloadOrgsMembershipTable) {

            const config = axiosAuth(accessToken);
            const urlMembershipInOrgs = `https://${domainName}/admin_api/organizations/which_the_logged_user_is_user/`;
            axiosInstance(refreshToken, authDispatch)
                .get(urlMembershipInOrgs, config)
                .then((response) => {
                    const orgsMembership = response.data;
                    setOrgsMembershipTable(plaformAssistantDispatch, { orgsMembership });
                    setLoadingOrgsMembership(false);
                    const reloadOrgsMembershipTable = false;
                    setReloadOrgsMembershipTable(plaformAssistantDispatch, { reloadOrgsMembershipTable });
                })
                .catch((error) => {
                    console.log(error);
                });
        } else {
            setLoadingOrgsMembership(false);
        }

    }, [
        accessToken,
        refreshToken,
        authDispatch,
        plaformAssistantDispatch,
        reloadOrgsMembershipTable,
        orgsMembershipTable.length]);

    useEffect(() => {
        if (groupsMembershipTable.length === 0 || reloadGroupsMembershipTable) {
            const config = axiosAuth(accessToken);
            const urlMembershipInGroups = `https://${domainName}/admin_api/groups/which_the_logged_user_is_member/`;
            axiosInstance(refreshToken, authDispatch)
                .get(urlMembershipInGroups, config)
                .then((response) => {
                    const groupsMembership = response.data;
                    setGroupsMembershipTable(plaformAssistantDispatch, { groupsMembership });
                    setLoadinGroupsMembership(false);
                    const reloadGroupsMembershipTable = false;
                    setReloadGroupsMembershipTable(plaformAssistantDispatch, { reloadGroupsMembershipTable });
                })
                .catch((error) => {
                    console.log(error);
                });
        } else {
            setLoadinGroupsMembership(false);
        }

    }, [
        accessToken,
        refreshToken,
        authDispatch,
        plaformAssistantDispatch,
        reloadGroupsMembershipTable,
        groupsMembershipTable.length
    ]);

    const clickHandler = (optionToShow: string) => {
        setOptionToShow(optionToShow);
    }

    return (
        <>
            <UserOptionsContainer>
                <OptionContainer
                    isOptionActive={optionToShow === USER_OPTIONS.USER_PROFILE}
                    onClick={() => clickHandler(USER_OPTIONS.USER_PROFILE)}
                >
                    User profile
                </OptionContainer>
                <OptionContainer
                    isOptionActive={optionToShow === USER_OPTIONS.MEMBERSHIP_IN_ORGS}
                    onClick={() => clickHandler(USER_OPTIONS.MEMBERSHIP_IN_ORGS)}
                >
                    Membership in orgs
                </OptionContainer>
                <OptionContainer
                    isOptionActive={optionToShow === USER_OPTIONS.MEMBERSHIP_IN_GROUPS}
                    onClick={() => clickHandler(USER_OPTIONS.MEMBERSHIP_IN_GROUPS)}
                >
                    Membership in groups
                </OptionContainer>
            </UserOptionsContainer>
            <ContentContainer >
                {(userProfileLoading || loadingOrgsMembership || loadingGroupsMembership) ?
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
                                columnsTable={MEMBERSHIP_IN_ORGS}
                                reloadTable={refreshOrgsMembership}
                                componentName=""
                            />}
                        {
                            optionToShow === USER_OPTIONS.MEMBERSHIP_IN_GROUPS
                            &&
                            <TableWithPagination
                                dataTable={groupsMembershipTable}
                                columnsTable={MEMBERSHIP_IN_GROUPS}
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
