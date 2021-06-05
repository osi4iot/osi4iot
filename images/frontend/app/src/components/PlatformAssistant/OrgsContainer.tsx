import React, { FC, useState } from 'react'
import { IOrganization, Create_ORGANIZATIONS_COLUMNS } from './TableColumns/organizationsColumns';
import TableWithPagination from './TableWithPagination';
import CreateOrganization from './CreateOrganization';
import EditOrganization from './EditOrganization';
import { ORGS_OPTIONS } from './platformAssistantOptions';
import { useOrgsDispatch, setOrgsOptionToShow, useOrgsOptionToShow } from '../../contexts/orgsOptions';


interface OrgsContainerProps {
    organizations: IOrganization[];
    refreshOrgs: () => void;
}

export interface IOrgAdminData {
    firstName: string;
    surname: string;
    email: string;
    login: string;
    password: string;
}

export interface IOrgInputData {
    name: string;
    acronym: string;
    address: string;
    city: string;
    zipCode: string;
    state: string;
    country: string;
    latitude: number;
    longitude: number;
    orgAdminArray: IOrgAdminData[];
}


const initialOrgData = {
    name: "",
    acronym: "",
    address: "",
    city: "",
    zipCode: "",
    state: "",
    country: "",
    longitude: 0,
    latitude: 0,
    telegramInvitationLink: "",
    telegramChatId: "",
    orgAdminArray: [
        {
            firstName: "",
            surname: "",
            email: "",
            login: "",
            password: ""
        }
    ]
}

const OrgsContainer: FC<OrgsContainerProps> = ({ organizations, refreshOrgs }) => {
    const orgsDispatch = useOrgsDispatch();
    const orgsOptionToShow = useOrgsOptionToShow();
    const [orgInputData, setOrgInputData] = useState<IOrgInputData>(initialOrgData)

    const showOrgsTableOption = () => {
        setOrgsOptionToShow(orgsDispatch, { orgsOptionToShow: ORGS_OPTIONS.TABLE });
        setOrgInputData(initialOrgData);
    }

    return (
        <>
            {orgsOptionToShow === ORGS_OPTIONS.CREATE_ORG &&
                <CreateOrganization
                    backToTable={showOrgsTableOption}
                    refreshOrgs={refreshOrgs}
                    orgInputData={orgInputData}
                    setOrgInputData={(orgInputData: IOrgInputData) => setOrgInputData(orgInputData)}
                />
            }
            {orgsOptionToShow === ORGS_OPTIONS.EDIT_ORG &&
                <EditOrganization
                    organizations={organizations}
                    refreshOrgs={refreshOrgs}
                    backToTable={showOrgsTableOption}
                />
            }
            {orgsOptionToShow === ORGS_OPTIONS.TABLE &&
                <TableWithPagination
                    dataTable={organizations}
                    columnsTable={Create_ORGANIZATIONS_COLUMNS(refreshOrgs)}
                    componentName="organization"
                    reloadTable={refreshOrgs}
                    createComponent={() => setOrgsOptionToShow(orgsDispatch, { orgsOptionToShow: ORGS_OPTIONS.CREATE_ORG })}
                />
            }
        </>
    )
}

export default OrgsContainer;