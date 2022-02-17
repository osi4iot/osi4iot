import { FC, useState, SyntheticEvent } from 'react';
import styled from "styled-components";
import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import { useAuthState, useAuthDispatch } from '../../../contexts/authContext';
import { axiosAuth, axiosInstance, getDomainName } from "../../../tools/tools";
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
import { setReloadGroupsMembershipTable, useGroupsManagedTable, usePlatformAssitantDispatch } from '../../../contexts/platformAssistantContext';


const FormContainer = styled.div`
	font-size: 12px;
    padding: 20px 10px 30px 10px;
    border: 3px solid #3274d9;
    border-radius: 20px;
    /* width: 700px; */
    height: calc(100vh - 290px);

    form > div:nth-child(2) {
        margin-right: 10px;
    }
`;

const ControlsContainer = styled.div`
    height: calc(100vh - 420px);
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
    const plaformAssistantDispatch = usePlatformAssitantDispatch();
    const groupManagedId = useGroupManagedIdToCreateGroupMembers();
    const groupManagedRowIndex = useGroupManagedRowIndex();
    const groupsManagedTable = useGroupsManagedTable();
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
        const url = `https://${domainName}/admin_api/group/${groupManagedId}/members`;
        const config = axiosAuth(accessToken);
        setIsSubmitting(true);
        axiosInstance(refreshToken, authDispatch)
            .post(url, values, config)
            .then((response) => {
                const data = response.data;
                toast.success(data.message);
                backToTable();
                refreshGroupMembers();
                const reloadGroupsMembershipTable = true;
                setReloadGroupsMembershipTable(plaformAssistantDispatch, { reloadGroupsMembershipTable });
            })
            .catch((error) => {
                const errorMessage = error.response.data.message;
                toast.error(errorMessage);
                backToTable();
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