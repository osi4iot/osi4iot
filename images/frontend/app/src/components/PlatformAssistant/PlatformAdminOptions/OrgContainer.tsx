import React, { FC, useState, useCallback } from 'react'
import { IOrganization, Create_ORGANIZATIONS_COLUMNS } from '../TableColumns/organizationsColumns';
import TableWithPagination from '../Utils/TableWithPagination';
import CreateOrganization from './CreateOrganization';
import EditOrganization from './EditOrganization';
import { ORGS_OPTIONS } from '../Utils/platformAssistantOptions';
import { useOrgsDispatch, setOrgsOptionToShow, useOrgsOptionToShow } from '../../../contexts/orgsOptions';
import { Column } from 'react-table';


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
    buildingId: number;
    // The form's LLM provider fields (see CreateOrganization).
    llmProviderType?: string;
    llmProviderUrl?: string;
    llmProviderApiKey?: string;
    llmAllowedModelsText?: string;
    orgAdminArray: IOrgAdminData[];
}


const initialOrgData = {
    name: "",
    acronym: "",
    role: "Generic",
    buildingId: 1,
    mqttAccessControl: "Pub & Sub",
    llmEnabled: false,
    llmProviderUrl: "https://api.openai.com/v1",
    llmProviderType: "openai",
    llmProviderApiKey: "",
    llmAllowedModelsText: "",
    telegramEnabled: false,
    telegramBotToken: "",
    gpuUsageEnabled: false,
    ragEnabled: false,
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

    const showOrgsTableOption = useCallback(() => {
        setOrgsOptionToShow(orgsDispatch, { orgsOptionToShow: ORGS_OPTIONS.TABLE });
        setOrgInputData(initialOrgData);
    }, [orgsDispatch]);
    
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
                    columnsTable={Create_ORGANIZATIONS_COLUMNS(refreshOrgs) as Column<any>[]}
                    componentName="organization"
                    reloadTable={refreshOrgs}
                    createComponent={() => setOrgsOptionToShow(orgsDispatch, { orgsOptionToShow: ORGS_OPTIONS.CREATE_ORG })}
                />
            }
        </>
    )
}

export default OrgsContainer;