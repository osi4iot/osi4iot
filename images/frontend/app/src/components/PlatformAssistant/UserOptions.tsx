import React, { FC, useEffect, useState } from 'react'
import styled from "styled-components";
import { axiosAuth, getDomainName } from '../../tools/tools';
import axios from 'axios';
import { useAuthState } from '../../contexts/authContext';
import Loader from "../Tools/Loader";
import TableWithPagination from './TableWithPagination';
import { MEMBERSHIP_IN_ORGS } from './TableColumns/membershipInOrgs';
import { MEMBERSHIP_IN_GROUPS } from './TableColumns/membershipInGroups';
import { USER_OPTIONS } from './platformAssistantOptions';
import UserProfile from './UserProfile';


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

const initialUserProfile = {
    userId: 0,
    name: "",
    firstName: "",
    surname: "",
    login: "",
    email: "",
    telegramId: "",
}

const domainName = getDomainName();

const UserOptions: FC<{}> = () => {
    const { accessToken } = useAuthState();
    const [optionToShow, setOptionToShow] = useState(USER_OPTIONS.USER_PROFILE);
    const [userProfile, setUserProfile] = useState(initialUserProfile);
    const [userProfileLoading, setUserProfileLoading] = useState(true);
    const [orgsMembership, setOrgsMembership] = useState([]);
    const [loadingOrgsMembership, setLoadingOrgsMembership] = useState(true);
    const [groupsMembership, setGroupsMembership] = useState([]);
    const [loadingGroupsMembership, setLoadinGroupsMembership] = useState(true);
    const [reloadUserProfile, setReloadUserProfile] = useState(0);

    const refreshUserProfile = () => {
        setReloadUserProfile(reloadUserProfile + 1);
        setUserProfileLoading(true);
    }

    useEffect(() => {
        const config = axiosAuth(accessToken);
        const urlUserProfile = `https://${domainName}/admin_api/auth/user_profile`;
        axios
            .get(urlUserProfile, config)
            .then((response) => {
                const userData = response.data;
                setUserProfile(userData);
                setUserProfileLoading(false);
            })
            .catch((error) => {
                console.log(error);
            });

    }, [accessToken, reloadUserProfile]);

    useEffect(() => {
        const config = axiosAuth(accessToken);
        const urlMembershipInOrgs = `https://${domainName}/admin_api/organizations/which_the_logged_user_is_user/`;
        axios
            .get(urlMembershipInOrgs, config)
            .then((response) => {
                const orgsMembership = response.data;
                setOrgsMembership(orgsMembership);
                setLoadingOrgsMembership(false);
            })
            .catch((error) => {
                console.log(error);
            });

    }, [accessToken]);
    
    useEffect(() => {
        const config = axiosAuth(accessToken);
        const urlMembershipInGroups = `https://${domainName}/admin_api/groups/which_the_logged_user_is_member/`;
        axios
            .get(urlMembershipInGroups, config)
            .then((response) => {
                const groupsMembership = response.data;
                setGroupsMembership(groupsMembership);
                setLoadinGroupsMembership(false);
            })
            .catch((error) => {
                console.log(error);
            });

    }, [accessToken]);

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
                            <UserProfile userProfile={userProfile} refreshUserProfile={refreshUserProfile}/>
                        }
                        {
                            optionToShow === USER_OPTIONS.MEMBERSHIP_IN_ORGS
                            &&
                            <TableWithPagination
                                dataTable={orgsMembership}
                                columnsTable={MEMBERSHIP_IN_ORGS}
                                componentName=""
                            />}
                        {
                            optionToShow === USER_OPTIONS.MEMBERSHIP_IN_GROUPS
                            &&
                            <TableWithPagination
                                dataTable={groupsMembership}
                                columnsTable={MEMBERSHIP_IN_GROUPS}
                                componentName=""
                            />}
                    </>
                }
            </ContentContainer>
        </>
    )
}

export default UserOptions;
