import { FC } from 'react';
import styled from "styled-components";
import {  setGlobalUsersOptionToShow, useGlobalUsersDispatch } from '../../contexts/globalUsers';
import {  GLOBAL_USERS_OPTIONS } from './platformAssistantOptions';
import { getDomainName } from '../../tools/tools';


const Container = styled.div`
    width: 90%;
    height: 90%;
    padding: 1rem;
    background-color: #202226;
    margin: 20px;
    padding: 20px;
    display: flex;
    flex-direction: row;
    justify-content: center;
    align-items: center;
    flex-wrap: wrap;
`

const domainName = getDomainName();

interface CreateGlobalUserProps {
    refreshGlobalUsers: () => void;
}

const CreateGlobalUser: FC<CreateGlobalUserProps> = ({refreshGlobalUsers}) => {
    const globalUsersDispatch = useGlobalUsersDispatch();

    const handleSubmit = () => {
        const globalUsersOptionToShow = { globalUsersOptionToShow: GLOBAL_USERS_OPTIONS.TABLE };
        setGlobalUsersOptionToShow(globalUsersDispatch, globalUsersOptionToShow);
        refreshGlobalUsers();
        console.log(domainName);
    }

    return (
        <Container>
            <div>Create global user</div>
            <div>
                <button onClick={handleSubmit}>Submit</button>
            </div>
        </Container>
    )
}

export default CreateGlobalUser;