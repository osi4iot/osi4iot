import React, { FC, useState } from 'react'
import styled from "styled-components";
import ChangePassword from './ChangePassword';
import EditUserProfile from './EditUserProfile';
import { USER_PROFILE_OPTIONS } from './platformAssistantOptions';


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

export interface IUserProfile {
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
    refreshUserProfile: () => void;
}


const UserProfile: FC<UserProfileProps> = ({ userProfile, refreshUserProfile }) => {
    const [userProfileOptionToShow, setUserProfileOptionToShow] = useState(USER_PROFILE_OPTIONS.USER_PROFILE);

    const changeUserProfileOptionToShow = (option: string) => {
        setUserProfileOptionToShow(option);
    }

    return (
        <>
            {
                userProfileOptionToShow === USER_PROFILE_OPTIONS.USER_PROFILE &&
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
                        <Button onClick={() => changeUserProfileOptionToShow(USER_PROFILE_OPTIONS.EDIT_USER_PROFILE)}>
                            Edit profile
                        </Button>
                        <Button onClick={() => changeUserProfileOptionToShow(USER_PROFILE_OPTIONS.CHANGE_PASSWORD)}>
                            Change password
                        </Button>
                    </ButtonsContainer>
                </UserProfileContainer >
            }
            {
                userProfileOptionToShow === USER_PROFILE_OPTIONS.EDIT_USER_PROFILE
                &&
                <EditUserProfile
                    refreshUserProfile={refreshUserProfile}
                    backToUserProfile={() => changeUserProfileOptionToShow(USER_PROFILE_OPTIONS.USER_PROFILE)}
                    userProfileToEdit={userProfile}
                />
            }
            {
                userProfileOptionToShow === USER_PROFILE_OPTIONS.CHANGE_PASSWORD
                &&
                <ChangePassword
                    backToUserProfile={() => changeUserProfileOptionToShow(USER_PROFILE_OPTIONS.USER_PROFILE)}
                />
            }
        </>

    )
}

export default UserProfile;