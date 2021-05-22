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


const Button = styled.button`
	background-color: #3274d9;
	padding: 10px 20px;
	color: white;
	border: 1px solid #2c3235;
	border-radius: 10px;
	outline: none;
	cursor: pointer;
	box-shadow: 0 5px #173b70;
    /* margin-left: auto; */

	&:hover {
		background-color: #2461c0;
	}

	&:active {
		background-color: #2461c0;
		box-shadow: 0 2px #173b70;
		transform: translateY(4px);
	}
`;

const UserProfileContainer = styled.div`
    margin-top: 40px;
    padding: 20px 30px 30px 30px;
    display: flex;
	flex-direction: column;
    justify-content: flex-start;
	align-items: flex-start;
    width: 390px;
    background-color: #202226;
    border: 3px solid #3274d9;
    border-radius: 20px;
`;

const ItemType = styled.span`
    background-color: #202226;
    font-weight: 600;
    margin-right: 5px;
`;

const ItemValue = styled.span`
    background-color: #202226;
`;

const UserProfileItem = styled.div`
    margin-top: 10px;
    margin-bottom: 10px;
    width: 100%;
    background-color: #202226;
`;

const ButtonsContainer = styled.div`
    margin-top: 20px;
    display: flex;
    flex-direction: row;
    justify-content: space-between;
	align-items: center;
    width: 100%;
    background-color: #202226;
`;

interface IUserProfile {
    userId: number;
    name: string;
    firstName: string;
    surname: string;
    login: string;
    email: string;
    telegramId: string;
}


interface UserProfileProps {
    userProfile: IUserProfile;
}


const UserProfile: FC<UserProfileProps> = ({ userProfile }) => {
    return (
        <UserProfileContainer >
            <UserProfileItem>
                <ItemType>First Name:</ItemType><ItemValue>{userProfile.firstName}</ItemValue>
            </UserProfileItem>
            <UserProfileItem>
                <ItemType>Surname:</ItemType><ItemValue>{userProfile.surname}</ItemValue>
            </UserProfileItem>
            <UserProfileItem>
                <ItemType>Email:</ItemType><ItemValue>{userProfile.email}</ItemValue>
            </UserProfileItem>
            <UserProfileItem>
                <ItemType>Username: </ItemType><ItemValue>{userProfile.login}</ItemValue>
            </UserProfileItem>
            <UserProfileItem>
                <ItemType>TelegramId:</ItemType><ItemValue>{userProfile.telegramId}</ItemValue>
            </UserProfileItem>
            <ButtonsContainer>
                <Button>
                    Edit profile
                </Button>
                <Button>
                    Change password
                </Button>
            </ButtonsContainer>
        </UserProfileContainer >
    )
}


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
    const [optionToShow, setOptionToShow] = useState("User profile");
    const [userProfile, setUserProfile] = useState(initialUserProfile);
    const [userProfileLoding, setUserProfileLoading] = useState(true);
    const [orgsMembership, setOrgsMembership] = useState([]);
    const [loadingOrgsMembership, setLoadingOrgsMembership] = useState(true);
    const [groupsMembership, setGroupsMembership] = useState([]);
    const [loadingGroupsMembership, setLoadinGroupsMembership] = useState(true);

    useEffect(() => {
        const urlUserProfile = `https://${domainName}/admin_api/auth/user_profile`;
        const config = axiosAuth(accessToken);
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
                {(userProfileLoding || loadingOrgsMembership || loadingGroupsMembership) ?
                    <Loader />
                    :
                    <>
                        {optionToShow === USER_OPTIONS.USER_PROFILE && <UserProfile userProfile={userProfile} />}
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
