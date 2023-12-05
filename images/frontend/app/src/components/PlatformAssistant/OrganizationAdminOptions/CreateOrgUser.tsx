import React, { FC, SyntheticEvent, useState } from 'react';
import styled from "styled-components";
import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import { useAuthState, useAuthDispatch } from '../../../contexts/authContext';
import { axiosAuth, getDomainName, getProtocol } from "../../../tools/tools";
import { toast } from "react-toastify";
import FormikControl from "../../Tools/FormikControl";
import FormButtonsProps from "../../Tools/FormButtons";
import FormTitle from "../../Tools/FormTitle";
import { useOrgManagedIdToCreateOrgUsers, useOrgManagedRowIndex } from '../../../contexts/orgsManagedOptions';
import { IOrgUsersInput } from './OrgsManagedContainer';
import SelectGlobalUsers from '../PlatformAdminOptions/SelectGlobalUsers';
import { ISelectGlobalUser } from '../TableColumns/selectGlobalUserColumns';
import {
    setReloadGroupMembersTable,
    setReloadGroupsMembershipTable,
    setReloadOrgsMembershipTable,
    setReloadSelectOrgUsersTable,
    useOrgsManagedTable,
    usePlatformAssitantDispatch
} from '../../../contexts/platformAssistantContext';
import { getAxiosInstance } from '../../../tools/axiosIntance';
import axiosErrorHandler from '../../../tools/axiosErrorHandler';

const FormContainer = styled.div`
	font-size: 12px;
    padding: 20px 10px 30px 10px;
    border: 3px solid #3274d9;
    border-radius: 20px;
    /* width: 700px; */
    height: calc(100vh - 310px);

    form > div:nth-child(2) {
        margin-right: 10px;
    }
`;

const ControlsContainer = styled.div`
    height: calc(100vh - 440px);
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
`;

const domainName = getDomainName();
const protocol = getProtocol();

interface CreateOrgUserProps {
    refreshOrgUsers: () => void;
    backToTable: () => void;
    orgUsersInputData: IOrgUsersInput;
    setOrgUsersInputData: (orgUsersInputData: IOrgUsersInput) => void;
}


const roleInOrgOptions = [
    {
        label: "Viewer",
        value: "Viewer"
    },
    {
        label: "Editor",
        value: "Editor"
    },
    {
        label: "Admin",
        value: "Admin"
    }
];

const initialOrgUsersValues = {
    users: [
        {
            firstName: "",
            surname: "",
            email: "",
            login: "",
            roleInOrg: "Viewer"
        }
    ]
}

const CreateOrgUser: FC<CreateOrgUserProps> = ({ refreshOrgUsers, backToTable, orgUsersInputData, setOrgUsersInputData }) => {
    const plaformAssistantDispatch = usePlatformAssitantDispatch();
    const orgsManagedTable = useOrgsManagedTable();
    const orgManagedRowIndex = useOrgManagedRowIndex();
    const orgAcronym = orgsManagedTable[orgManagedRowIndex].acronym;
    const orgManagedId = useOrgManagedIdToCreateOrgUsers();
    const [showCreateOrgUsers, setShowCreateOrgUsers] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [selectedUsersArray, setSelectedUsersArray] = useState<ISelectGlobalUser[]>([]);
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();
    const initialOrgUsersData = { ...orgUsersInputData };
    if (selectedUsersArray.length !== 0) {
        const newUsers = selectedUsersArray.map(user => {
            const newUser = {
                firstName: user.firstName,
                surname: user.surname,
                email: user.email,
                login: user.login,
                roleInOrg: "Viewer"
            };
            return newUser;
        });
        const lastUser = initialOrgUsersData.users[initialOrgUsersData.users.length - 1];
        if (Object.values(lastUser).filter(value => value !== "" && value !== "Viewer").length === 0) {
            initialOrgUsersData.users = [...initialOrgUsersData.users.slice(0, -1), ...newUsers];
        } else {
            initialOrgUsersData.users = [...initialOrgUsersData.users, ...newUsers];
        }
    }

    const validationSchema = Yup.object().shape({
        users: Yup.array()
            .of(
                Yup.object().shape({
                    firstName: Yup.string().max(127, "The maximum number of characters allowed is 127").required('Required'),
                    surname: Yup.string().max(127, "The maximum number of characters allowed is 127").required('Required'),
                    email: Yup.string().email("Enter a valid email").max(190, "The maximum number of characters allowed is 190").required('Required'),
                    login: Yup.string()
                        .matches(/^[a-zA-Z0-9._-]{4,}$/, "Only the following characters are allowed for username: a-zA-Z0-9._-")
                        .min(4, "The minimum number of characters allowed is 4")
                        .max(190, "The maximum number of characters allowed is 190"),
                    roleInOrg: Yup.string().required('Required')
                })
            )
            .required('Must have org admin') // these constraints are shown if and only if inner constraints are satisfied
            .min(1, 'Must be at least one org amdin')
    });

    const onSubmit = (values: {}, actions: any) => {
        const url = `${protocol}://${domainName}/admin_api/organization/${orgManagedId}/users`;
        const config = axiosAuth(accessToken);
        setIsSubmitting(true);
        getAxiosInstance(refreshToken, authDispatch)
            .post(url, values, config)
            .then((response) => {
                const data = response.data;
                toast.success(data.message);
                backToTable();
            })
            .catch((error) => {
                axiosErrorHandler(error, authDispatch);
                backToTable();
            })
            .finally(() => {
                refreshOrgUsers();
                const reloadSelectOrgUsersTable = true;
                setReloadSelectOrgUsersTable(plaformAssistantDispatch, { reloadSelectOrgUsersTable });
                const reloadGroupMembersTable = true;
                setReloadGroupMembersTable(plaformAssistantDispatch, { reloadGroupMembersTable });
                const reloadOrgsMembershipTable = true;
                setReloadOrgsMembershipTable(plaformAssistantDispatch, { reloadOrgsMembershipTable });
                const reloadGroupsMembershipTable = true;
                setReloadGroupsMembershipTable(plaformAssistantDispatch, { reloadGroupsMembershipTable });
            })
    }

    const onCancel = (e: SyntheticEvent) => {
        e.preventDefault();
        setOrgUsersInputData(initialOrgUsersValues);
        backToTable();
    };

    const goToSelect = (orgUsersInputData: IOrgUsersInput) => {
        setOrgUsersInputData(orgUsersInputData);
        setShowCreateOrgUsers(false);
    }

    return (

        <>
            {
                showCreateOrgUsers ?
                    <>
                        <FormTitle isSubmitting={isSubmitting} >Add users to org {orgAcronym}</FormTitle>
                        <FormContainer>
                            <Formik initialValues={initialOrgUsersData} validationSchema={validationSchema} onSubmit={onSubmit} >
                                {
                                    formik => (
                                        <Form>
                                            <ControlsContainer>
                                                <FormikControl
                                                    control='inputArrayRows'
                                                    label='Org user'
                                                    name='users'
                                                    labelArray={['First name *', 'Surname *', 'Email *', 'Username', 'Role in org']}
                                                    nameArray={['firstName', 'surname', 'email', 'login', 'roleInOrg']}
                                                    typeArray={['text', 'text', 'email', 'text', 'select']}
                                                    addLabel="org user"
                                                    options={roleInOrgOptions}
                                                    selectLabel="user"
                                                    goToSelect={() => goToSelect(formik.values)}
                                                />
                                            </ControlsContainer>
                                            <FormButtonsProps onCancel={onCancel} isValid={formik.isValid} isSubmitting={formik.isSubmitting} isWideForm={true} />
                                        </Form>
                                    )
                                }
                            </Formik>
                        </FormContainer>
                    </>
                    :
                    <SelectGlobalUsers
                        backToCreate={() => setShowCreateOrgUsers(true)}
                        setSelectedUsersArray={(selectedUsers: ISelectGlobalUser[]) => setSelectedUsersArray(selectedUsers)}
                    />

            }
        </>
    )
}

export default CreateOrgUser;