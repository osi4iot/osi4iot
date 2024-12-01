import { FC, useState, SyntheticEvent } from 'react';
import styled from "styled-components";
import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import { useAuthState, useAuthDispatch } from '../../../contexts/authContext';
import { axiosAuth, getDomainName, getProtocol } from "../../../tools/tools";
import { toast } from "react-toastify";
import FormikControl from "../../Tools/FormikControl";
import FormButtonsProps from "../../Tools/FormButtons";
import FormTitle from "../../Tools/FormTitle";
import { setOrgsOptionToShow, useOrgsDispatch } from '../../../contexts/orgsOptions';
import { ORGS_OPTIONS } from '../Utils/platformAssistantOptions';
import { ISelectGlobalUser } from '../TableColumns/selectGlobalUserColumns';
import SelectGlobalUsers from './SelectGlobalUsers';
import { IOrgInputData } from './OrgContainerOld';
import {
    setReloadGroupsTable,
    setReloadGroupsMembershipTable,
    setReloadOrgsManagedTable,
    setReloadOrgsMembershipTable,
    usePlatformAssitantDispatch,
    setReloadGroupsManagedTable,
    setReloadGroupMembersTable,
    setReloadDigitalTwinsTable,
    setReloadDashboardsTable,
    setReloadOrgsOfGroupsManagedTable,
    setReloadOrgUsersTable,
    setReloadTopicsTable,
    setReloadNodeRedInstancesTable
} from '../../../contexts/platformAssistantContext';
import { getAxiosInstance } from '../../../tools/axiosIntance';
import axiosErrorHandler from '../../../tools/axiosErrorHandler';
import { AxiosResponse, AxiosError } from 'axios';



const FormContainer = styled.div`
	font-size: 12px;
    padding: 30px 10px 30px 20px;
    border: 3px solid #3274d9;
    border-radius: 20px;
    width: 400px;
    height: calc(100vh - 310px);

    form > div:nth-child(2) {
        margin-right: 10px;
    }
`;

const ControlsContainer = styled.div`
    height: calc(100vh - 430px);
    width: 100%;
    padding: 0px 5px;
    overflow-y: auto;
    /* width */
    ::-webkit-scrollbar {
        width: 10px;
    }

    /* Track */
    ::-webkit-scrollbar-track {
        background: #202226;
        border-radius: 5px;
    }
    
    /* Handle */
    ::-webkit-scrollbar-thumb {
        background: #2c3235; 
        border-radius: 5px;
    }

    /* Handle on hover */
    ::-webkit-scrollbar-thumb:hover {
        background-color: #343840;
    }

    div:first-child {
        margin-top: 0;
    }

    div:last-child {
        margin-bottom: 3px;
    }
`;

const mqttAccessControlOptions = [
    {
        label: "Subscribe & Publish",
        value: "Pub & Sub"
    },
    {
        label: "Subscribe",
        value: "Sub"
    },
    {
        label: "Publish",
        value: "Pub"
    },
    {
        label: "None",
        value: "None"
    }
];

const domainName = getDomainName();
const protocol = getProtocol();

interface CreateOrganizationProps {
    backToTable: () => void;
    refreshOrgs: () => void;
    orgInputData: IOrgInputData;
    setOrgInputData: (orgInputData: IOrgInputData) => void;
}

const CreateOrganization: FC<CreateOrganizationProps> = ({ backToTable, refreshOrgs, orgInputData, setOrgInputData }) => {
    const plaformAssistantDispatch = usePlatformAssitantDispatch();
    const [showCreateOrg, setShowCreateOrg] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [selectedUsersArray, setSelectedUsersArray] = useState<ISelectGlobalUser[]>([]);
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();
    const orgsDispatch = useOrgsDispatch();
    const initialOrgData = { ...orgInputData };
    if (selectedUsersArray.length !== 0) {
        const newOrgAdmins = selectedUsersArray.map(user => {
            const orgAdminData = {
                firstName: user.firstName,
                surname: user.surname,
                email: user.email,
                login: "",
                password: ""
            };
            return orgAdminData;
        });
        const lastOrgAdmin = initialOrgData.orgAdminArray[initialOrgData.orgAdminArray.length - 1];
        if (Object.values(lastOrgAdmin).filter(value => value !== "").length === 0) {
            initialOrgData.orgAdminArray = [...initialOrgData.orgAdminArray.slice(0, -1), ...newOrgAdmins];
        } else {
            initialOrgData.orgAdminArray = [...initialOrgData.orgAdminArray, ...newOrgAdmins];
        }
    }

    const validationSchema = Yup.object().shape({
        name: Yup.string().max(190, "The maximum number of characters allowed is 190").required('Required'),
        acronym: Yup.string().max(20, "The maximum number of characters allowed is 20").required('Required'),
        buildingId: Yup.number().positive().integer().required('Required'),
        telegramInvitationLink: Yup.string().url("Enter a valid url").max(60, "The maximum number of characters allowed is 60").required('Required'),
        telegramChatId: Yup.string().max(15, "The maximum number of characters allowed is 15").required('Required'),
        orgAdminArray: Yup.array()
            .of(
                Yup.object().shape({
                    firstName: Yup.string().max(127, "The maximum number of characters allowed is 127").required('Required'),
                    surname: Yup.string().max(127, "The maximum number of characters allowed is 127").required('Required'),
                    email: Yup.string().email("Enter a valid email").max(190, "The maximum number of characters allowed is 190").required('Required'),
                    login: Yup.string()
                        .matches(/^[a-zA-Z0-9._-]{4,}$/, "Only the following characters are allowed for username: a-zA-Z0-9._-")
                        .min(4, "The minimum number of characters allowed is 4")
                        .max(190, "The maximum number of characters allowed is 190"),
                    password: Yup.string()
                        .matches(/^[a-zA-Z0-9._-]{8,20}$/, "Only the following characters are allowed for username: a-zA-Z0-9._-")
                        .min(4, "The minimum number of characters allowed is 8")
                        .max(20, "The maximum number of characters allowed is 20"),
                })
            )
            .required('Must have org admin') // these constraints are shown if and only if inner constraints are satisfied
            .min(1, 'Must be at least one org amdin'),
    });

    const onSubmit = (values: {}, actions: any) => {
        const url = `${protocol}://${domainName}/admin_api/organization`;
        const config = axiosAuth(accessToken);

        if (typeof (values as any).buildingId === 'string') {
            (values as any).buildingId = parseInt((values as any).buildingId, 10);
        }

        setIsSubmitting(true);
        getAxiosInstance(refreshToken, authDispatch)
            .post(url, values, config)
            .then((response: AxiosResponse<any, any>) => {
                const data = response.data;
                toast.success(data.message);
                const orgsOptionToShow = { orgsOptionToShow: ORGS_OPTIONS.TABLE };
                setIsSubmitting(false);
                setOrgsOptionToShow(orgsDispatch, orgsOptionToShow);
            })
            .catch((error: AxiosError) => {
                axiosErrorHandler(error, authDispatch);
                backToTable();
            })
            .finally(() => {
                refreshOrgs();
                const reloadOrgsManagedTable = true;
                setReloadOrgsManagedTable(plaformAssistantDispatch, { reloadOrgsManagedTable });
                const reloadOrgUsersTable = true;
                setReloadOrgUsersTable(plaformAssistantDispatch, { reloadOrgUsersTable });
                const reloadOrgsMembershipTable = true;
                setReloadOrgsMembershipTable(plaformAssistantDispatch, { reloadOrgsMembershipTable });
                const reloadGroupsTable = true;
                setReloadGroupsTable(plaformAssistantDispatch, { reloadGroupsTable });
                const reloadGroupsMembershipTable = true;
                setReloadGroupsMembershipTable(plaformAssistantDispatch, { reloadGroupsMembershipTable });
                const reloadGroupsManagedTable = true;
                setReloadGroupsManagedTable(plaformAssistantDispatch, { reloadGroupsManagedTable });
                const reloadNodeRedInstancesTable = true;
                setReloadNodeRedInstancesTable(plaformAssistantDispatch, { reloadNodeRedInstancesTable });

                const reloadOrgsOfGroupsManagedTable = true;
                setReloadOrgsOfGroupsManagedTable(plaformAssistantDispatch, { reloadOrgsOfGroupsManagedTable });
                const reloadGroupMembersTable = true;
                setReloadGroupMembersTable(plaformAssistantDispatch, { reloadGroupMembersTable });
                const reloadTopicsTable = true;
                setReloadTopicsTable(plaformAssistantDispatch, { reloadTopicsTable });
                const reloadDigitalTwinsTable = true;
                setReloadDigitalTwinsTable(plaformAssistantDispatch, { reloadDigitalTwinsTable });
                const reloadDashboardsTable = true;
                setReloadDashboardsTable(plaformAssistantDispatch, { reloadDashboardsTable });
            })
    }

    const onCancel = (e: SyntheticEvent) => {
        e.preventDefault();
        backToTable();
    };

    const goToSelect = (orgInputData: IOrgInputData) => {
        setOrgInputData(orgInputData);
        setShowCreateOrg(false);
    }

    return (
        <>
            {showCreateOrg ?
                <>
                    <FormTitle isSubmitting={isSubmitting} >Create org</FormTitle>
                    <FormContainer>
                        <Formik initialValues={initialOrgData} validationSchema={validationSchema} onSubmit={onSubmit} >
                            {
                                formik => (
                                    <Form>
                                        <ControlsContainer>
                                            <FormikControl
                                                control='input'
                                                label='Org name'
                                                name='name'
                                                type='text'
                                            />
                                            <FormikControl
                                                control='input'
                                                label='Org acronym'
                                                name='acronym'
                                                type='text'
                                            />
                                            <FormikControl
                                                control='input'
                                                label='Building Id'
                                                name='buildingId'
                                                type='text'
                                            />
                                            <FormikControl
                                                control='select'
                                                label='Mqtt access control'
                                                name="mqttAccessControl"
                                                options={mqttAccessControlOptions}
                                                type='text'
                                            />
                                            <FormikControl
                                                control='input'
                                                label='Telegram invitation link'
                                                name='telegramInvitationLink'
                                                type='text'
                                            />
                                            <FormikControl
                                                control='input'
                                                label='Telegram chat id'
                                                name='telegramChatId'
                                                type='text'
                                            />
                                            <FormikControl
                                                control='inputArray'
                                                label='Organization admins'
                                                name='orgAdminArray'
                                                labelArray={['First name *', 'Surname *', 'Email *', 'Username', 'Password']}
                                                nameArray={['firstName', 'surname', 'email', 'login', 'password']}
                                                typeArray={['text', 'text', 'email', 'text', 'password']}
                                                addLabel="org admim"
                                                selectLabel="user"
                                                goToSelect={() => goToSelect(formik.values)}
                                            />
                                        </ControlsContainer>
                                        <FormButtonsProps onCancel={onCancel} isValid={formik.isValid} isSubmitting={formik.isSubmitting} />
                                    </Form>
                                )
                            }
                        </Formik>
                    </FormContainer>
                </>
                :
                <SelectGlobalUsers
                    backToCreate={() => setShowCreateOrg(true)}
                    setSelectedUsersArray={(selectedUsers: ISelectGlobalUser[]) => setSelectedUsersArray(selectedUsers)}
                />
            }
        </>
    )
}

export default CreateOrganization;