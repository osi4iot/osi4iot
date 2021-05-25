import { FC } from 'react';
import styled from "styled-components";
import {
    useGlobalUserIdToEdit,
    setGlobalUsersOptionToShow,
    useGlobalUserRowIndexToEdit,
    useGlobalUsersDispatch
} from '../../contexts/globalUsers';
import { GLOBAL_USERS_OPTIONS } from './platformAssistantOptions';
import { getDomainName } from '../../tools/tools';
import { IGlobalUser } from './TableColumns/globalUsersColumns';



const Container = styled.div`
    width: 90%;
    height: 90%;
    padding: 1rem;
    background-color: #202226;
    margin: 20px;
    padding: 20px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    flex-wrap: wrap;
`

const domainName = getDomainName();

interface EditGlobalUserProps {
    globalUsers: IGlobalUser[];
    refreshGlobalUsers: () => void;
}

const EditGlobalUser: FC<EditGlobalUserProps> = ({globalUsers, refreshGlobalUsers}) => {
    const globalUserDispatch = useGlobalUsersDispatch();
    const globalUserId = useGlobalUserIdToEdit();
    const globalUserRowIndex = useGlobalUserRowIndexToEdit();

    const handleSubmit = () => {
        const globalUsersOptionToShow = { globalUsersOptionToShow: GLOBAL_USERS_OPTIONS.TABLE };
        setGlobalUsersOptionToShow(globalUserDispatch, globalUsersOptionToShow);
        refreshGlobalUsers();
        console.log(domainName);
    }

    return (
        <Container>
            <div>Edit global user</div>
            <div>global user id= {globalUserId} </div>
            <div>global user row Index= {globalUserRowIndex} </div>
            <div>
                <button onClick={handleSubmit}>Submit</button>
            </div>
        </Container>
    )
}

export default EditGlobalUser;