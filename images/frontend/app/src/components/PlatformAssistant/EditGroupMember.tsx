import { FC } from 'react';
import styled from "styled-components";
import {
    useGroupMembersDispatch,
    setGroupMembersOptionToShow,
    useGroupMemberGroupIdToEdit,
    useGroupMemberUserIdToEdit,
    useGroupMembeRowIndexToEdit
} from '../../contexts/groupMembersOptions';
import { GROUP_MEMBERS_OPTIONS } from './platformAssistantOptions';
import { getDomainName } from '../../tools/tools';
import { IGroupMember } from './TableColumns/groupMemberColumns';


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

interface EditGroupMemberProps {
    groupMembers: IGroupMember[];
    refreshGroupMembers: () => void;
}

const EditGroupMember: FC<EditGroupMemberProps> = ({ groupMembers, refreshGroupMembers }) => {
    const groupMembersDispatch = useGroupMembersDispatch();
    const groupId = useGroupMemberGroupIdToEdit();
    const userId = useGroupMemberUserIdToEdit();
    const groupMemberRowIndex = useGroupMembeRowIndexToEdit();

    const handleSubmit = () => {
        const groupMembersOptionToShow = { groupMembersOptionToShow: GROUP_MEMBERS_OPTIONS.TABLE };
        setGroupMembersOptionToShow(groupMembersDispatch, groupMembersOptionToShow);
        refreshGroupMembers();
        console.log(domainName);
    }


    return (
        <Container>
            <div>Edit group member</div>
            <div>GroupId={groupId} and userId={userId} </div>
            <div>Group Member row index={groupMemberRowIndex} </div>
            <div>
                <button onClick={handleSubmit}>Submit</button>
            </div>
        </Container>
    )
}

export default EditGroupMember;