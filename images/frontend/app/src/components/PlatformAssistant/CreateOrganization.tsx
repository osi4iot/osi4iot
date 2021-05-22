import { FC } from 'react';
import styled from "styled-components";
import { setOrgsOptionToShow, useOrgsDispatch } from '../../contexts/orgs';
import {  ORGS_OPTIONS } from './platformAssistantOptions';
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

interface CreateOrganizationProps {
    refreshOrgs: () => void;
}

const CreateOrganization: FC<CreateOrganizationProps> = ({refreshOrgs}) => {
    const orgsDispatch = useOrgsDispatch();

    const handleSubmit = () => {
        const orgsOptionToShow = { orgsOptionToShow: ORGS_OPTIONS.TABLE };
        setOrgsOptionToShow(orgsDispatch, orgsOptionToShow);
        refreshOrgs();
        console.log(domainName);
    }

    return (
        <Container>
            <div>Create org</div>
            <div>
                <button onClick={handleSubmit}>Submit</button>
            </div>
        </Container>
    )
}

export default CreateOrganization;