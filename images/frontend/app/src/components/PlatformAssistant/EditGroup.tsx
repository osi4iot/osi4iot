import { FC } from 'react';
import styled from "styled-components";
import { setGroupsOptionToShow, useGroupIdToEdit, useGroupsDispatch } from '../../contexts/groups';
import {  GROUPS_OPTIONS } from './platformAssistantOptions';
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

interface EditGroupProps {
    refreshGroups: () => void;
}

const EditGroup: FC<EditGroupProps> = ({refreshGroups} ) => {
    const groupsDispatch = useGroupsDispatch();
    const groupId = useGroupIdToEdit();

    const handleSubmit = () => {
        const groupsOptionToShow = { groupsOptionToShow: GROUPS_OPTIONS.TABLE };
        setGroupsOptionToShow(groupsDispatch, groupsOptionToShow);
        refreshGroups();
        console.log(domainName);
    }

    return (
        <Container>
            <div>Edit group</div>
            <div>Group id= {groupId} </div>
            <div>
                <button onClick={handleSubmit}>Submit</button>
            </div>
        </Container>
    )
}

export default EditGroup;