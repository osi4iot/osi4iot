import { FC, useState, SyntheticEvent } from 'react';
import { reloadTable, useTable } from "../../../state";
import styled from "styled-components";
import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import { useAuthState, useAuthDispatch } from '../../../contexts/authContext';
import { axiosAuth, getDomainName, getProtocol } from "../../../tools/tools";
import { toast } from "react-toastify";
import FormikControl from "../../Tools/FormikControl";
import FormButtonsProps from "../../Tools/FormButtons";
import FormTitle from "../../Tools/FormTitle";
import { IGroupMembersInput } from './GroupsManagedContainer';
import { ISelectOrgUser } from '../TableColumns/selectOrgUsersColumns';
import {
    useGroupManagedIdToCreateGroupMembers,
    useGroupManagedRowIndex
} from '../../../contexts/groupsManagedOptions';
import SelectOrgUsers from '../OrganizationAdminOptions/SelectOrgUsers';
import { getAxiosInstance } from '../../../tools/axiosIntance';
import axiosErrorHandler from '../../../tools/axiosErrorHandler';
import { AxiosError, AxiosResponse } from 'axios';
import { FormCard as FormContainer, ControlsContainer } from "../../Tools/FormTools";


const domainName = getDomainName();
const protocol = getProtocol();

interface CreateGroupMemberProps {
    refreshGroupMembers: () => void;
    backToTable: () => void;
    groupMembersInputData: IGroupMembersInput;
    setGroupMembersInputData: (groupMembersInputData: IGroupMembersInput) => void;
}

const roleInGroupOptions = [
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

const initialGroupMembersValues = {
    members: [
        {
            firstName: "",
            surname: "",
            email: "",
            roleInGroup: "Viewer"
        }
    ]
}

const CreateGroupMember: FC<CreateGroupMemberProps> = ({ refreshGroupMembers, backToTable, groupMembersInputData, setGroupMembersInputData }) => {
    const groupManagedId = useGroupManagedIdToCreateGroupMembers();
    const groupManagedRowIndex = useGroupManagedRowIndex();
    const groupsManagedTable = useTable("groupsManaged");
    const groupAcronym = groupsManagedTable[groupManagedRowIndex].acronym;
    const orgId = groupsManagedTable[groupManagedRowIndex].orgId;
    const [showAddGroupMembers, setShowAddGroupMembers] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [selectedUsersArray, setSelectedUsersArray] = useState<ISelectOrgUser[]>([]);
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();
    const initialGroupMembersData = { ...groupMembersInputData };
    if (selectedUsersArray.length !== 0) {
        const newMembers = selectedUsersArray.map(user => {
            const newMember = {
                firstName: user.firstName,
                surname: user.surname,
                email: user.email,
                roleInGroup: "Viewer"
            };
            return newMember;
        });
        const lastUser = initialGroupMembersData.members[initialGroupMembersData.members.length - 1];
        if (Object.values(lastUser).filter(value => value !== "" && value !== "Viewer").length === 0) {
            initialGroupMembersData.members = [...initialGroupMembersData.members.slice(0, -1), ...newMembers];
        } else {
            initialGroupMembersData.members = [...initialGroupMembersData.members, ...newMembers];
        }
    }

    const validationSchema = Yup.object().shape({
        members: Yup.array()
            .of(
                Yup.object().shape({
                    firstName: Yup.string().max(127, "The maximum number of characters allowed is 127").required('Required'),
                    surname: Yup.string().max(127, "The maximum number of characters allowed is 127").required('Required'),
                    email: Yup.string().email("Enter a valid email").max(190, "The maximum number of characters allowed is 190").required('Required'),
                    roleInGroup: Yup.string().required('Required')
                })
            )
            .required('Must have org admin') // these constraints are shown if and only if inner constraints are satisfied
            .min(1, 'Must be at least one org amdin')
    });

    const onSubmit = (values: {}, actions: any) => {
        const url = `${protocol}://${domainName}/admin_api/group/${groupManagedId}/members`;
        const config = axiosAuth(accessToken);
        setIsSubmitting(true);
        getAxiosInstance(refreshToken, authDispatch)
            .post(url, values, config)
            .then((response: AxiosResponse<any, any>) => {
                const data = response.data;
                toast.success(data.message);
                backToTable();
                reloadTable("groupsMembership");
            })
            .catch((error: AxiosError) => {
                axiosErrorHandler(error, authDispatch);
                backToTable();
            })
            .finally(() => {
                refreshGroupMembers();
            })
    }

    const onCancel = (e: SyntheticEvent) => {
        e.preventDefault();
        setGroupMembersInputData(initialGroupMembersValues);
        backToTable();
    };

    const goToSelect = (groupMembersInputData: IGroupMembersInput) => {
        setGroupMembersInputData(groupMembersInputData);
        setShowAddGroupMembers(false);
    }

    return (

        <>
            {
                showAddGroupMembers ?
                    <>
                        <FormTitle isSubmitting={isSubmitting} >Add members to group {groupAcronym}</FormTitle>
                        <FormContainer>
                            <Formik initialValues={initialGroupMembersData} validationSchema={validationSchema} onSubmit={onSubmit} >
                                {
                                    formik => (
                                        // @ts-ignore
                                        <Form>
                                            <ControlsContainer>
                                                <FormikControl
                                                    control='inputArrayRows'
                                                    label='Group members'
                                                    name='members'
                                                    labelArray={['First name *', 'Surname *', 'Email *', 'Role in group']}
                                                    nameArray={['firstName', 'surname', 'email', 'roleInGroup']}
                                                    typeArray={['text', 'text', 'email', 'select']}
                                                    addLabel="group member"
                                                    options={roleInGroupOptions}
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
                    <SelectOrgUsers
                        orgId={orgId}
                        backToCreate={() => setShowAddGroupMembers(true)}
                        setSelectedUsersArray={(selectedUsers: ISelectOrgUser[]) => setSelectedUsersArray(selectedUsers)}
                    />

            }
        </>
    )
}

export default CreateGroupMember;