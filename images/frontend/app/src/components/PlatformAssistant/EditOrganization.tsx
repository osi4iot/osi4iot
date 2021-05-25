import { FC } from 'react';
import styled from "styled-components";
import {
    useOrgsDispatch,
    useOrgIdToEdit,
    useOrgRowIndexToEdit,
    setOrgsOptionToShow
} from '../../contexts/orgs';
import { ORGS_OPTIONS } from './platformAssistantOptions';
import { getDomainName } from '../../tools/tools';
import { IOrganization } from './TableColumns/organizationsColumns';


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

interface EditOrganizationProps {
    organizations: IOrganization[];
    refreshOrgs: () => void;
}

const EditOrganization: FC<EditOrganizationProps> = ({ organizations, refreshOrgs }) => {
    const orgsDispatch = useOrgsDispatch();
    const orgId = useOrgIdToEdit();
    const orgRowIndex = useOrgRowIndexToEdit();

    const handleSubmit = () => {
        const orgsOptionToShow = { orgsOptionToShow: ORGS_OPTIONS.TABLE };
        setOrgsOptionToShow(orgsDispatch, orgsOptionToShow);
        refreshOrgs();
        console.log(domainName);
    }

    return (
        <Container>
            <div>Edit org</div>
            <div>Org id= {orgId} </div>
            <div>Org row index={orgRowIndex}</div>
            <div>
                <button onClick={handleSubmit}>Submit</button>
            </div>
        </Container>
    )
}

export default EditOrganization;