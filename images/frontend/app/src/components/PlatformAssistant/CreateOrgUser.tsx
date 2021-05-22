import { FC } from 'react';
import styled from "styled-components";
import { useOrgUsersDispatch, setOrgUsersOptionToShow } from '../../contexts/orgUsers';
import { ORG_USERS_OPTIONS } from './platformAssistantOptions';
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

interface CreateOrgUserProps {
    refreshOrgUsers: () => void;
}

const CreateOrgUser: FC<CreateOrgUserProps> = ({refreshOrgUsers}) => {
    const orgsUsersDispatch = useOrgUsersDispatch();

    const handleSubmit = () => {
        const orgUsersOptionToShow = { orgUsersOptionToShow: ORG_USERS_OPTIONS.TABLE };
        setOrgUsersOptionToShow(orgsUsersDispatch, orgUsersOptionToShow);
        refreshOrgUsers();
        console.log(domainName);
    }

    return (
        <Container>
            <div>Create org user</div>
            <div>
                <button onClick={handleSubmit}>Submit</button>
            </div>
        </Container>
    )
}

export default CreateOrgUser;