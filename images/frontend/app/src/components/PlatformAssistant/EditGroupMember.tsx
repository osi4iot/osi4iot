import { FC, useState, SyntheticEvent } from 'react';
import styled from "styled-components";
import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import { useAuthState, useAuthDispatch } from '../../contexts/authContext';
import { axiosAuth, axiosInstance, getDomainName } from "../../tools/tools";
import { toast } from "react-toastify";
import FormikControl from "../Tools/FormikControl";
import FormButtonsProps from "../Tools/FormButtons";
import FormTitle from "../Tools/FormTitle";
import {
    useGroupMembersDispatch,
    setGroupMembersOptionToShow,
    useGroupMemberGroupIdToEdit,
    useGroupMemberUserIdToEdit,
    useGroupMembeRowIndexToEdit
} from '../../contexts/groupMembersOptions';
import { GROUP_MEMBERS_OPTIONS } from './platformAssistantOptions';
import { IGroupMember } from './TableColumns/groupMemberColumns';


const FormContainer = styled.div`
	font-size: 12px;
    padding: 30px 20px;
    border: 3px solid #3274d9;
    border-radius: 20px;
    width: 400px;
`;

const ControlsContainer = styled.div`
    width: 100%;

    div:first-child {
        margin-top: 0;
    }
`;

const FieldContainer = styled.div`
    margin: 20px 0;

    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    align-items: flex-start;
    width: 100%;

    & label {
        font-size: 12px;
        margin: 0 0 5px 3px;
        width: 100%;
    }

    & div {
        font-size: 14px;
        background-color: #0c0d0f;
        border: 2px solid #2c3235;
        padding: 5px;
        margin-left: 2px;
        color: white;
        width: 100%;
    }
`;

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

const domainName = getDomainName();

interface EditGroupMemberProps {
    groupMembers: IGroupMember[];
    refreshGroupMembers: () => void;
    backToTable: () => void;
}

const EditGroupMember: FC<EditGroupMemberProps> = ({ groupMembers, refreshGroupMembers, backToTable }) => {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();
    const groupMembersDispatch = useGroupMembersDispatch();
    const groupId = useGroupMemberGroupIdToEdit();
    const userId = useGroupMemberUserIdToEdit();
    const groupMemberRowIndex = useGroupMembeRowIndexToEdit();

    const initialGroupMemberData = {
        roleInGroup: groupMembers[groupMemberRowIndex].roleInGroup
    }

    const validationSchema = Yup.object().shape({
        roleInGroup: Yup.string().required('Required'),
    })

    const onSubmit = (values: any, actions: any) => {
        const url = `https://${domainName}/admin_api/group/${groupId}/member/id/${userId}`;
        const config = axiosAuth(accessToken);
        setIsSubmitting(true);
        axiosInstance(refreshToken, authDispatch)
            .patch(url, values, config)
            .then((response) => {
                const data = response.data;
                toast.success(data.message);
                setIsSubmitting(false);
                setGroupMembersOptionToShow(groupMembersDispatch, { groupMembersOptionToShow: GROUP_MEMBERS_OPTIONS.TABLE });
                refreshGroupMembers();
            })
            .catch((error) => {
                const errorMessage = error.response.data.message;
                toast.error(errorMessage);
                backToTable();
            })
    }

    const onCancel = (e: SyntheticEvent) => {
        e.preventDefault();
        backToTable();
    };

    return (
        <>
            <FormTitle isSubmitting={isSubmitting} >Edit role for group member</FormTitle>
            <FormContainer>
                <Formik initialValues={initialGroupMemberData} validationSchema={validationSchema} onSubmit={onSubmit} >
                    {
                        formik => (
                            <Form>
                                <ControlsContainer>
                                    <FieldContainer>
                                        <label>First Name</label>
                                        <div>{groupMembers[groupMemberRowIndex].firstName}</div>
                                    </FieldContainer>
                                    <FieldContainer>
                                        <label>Surname</label>
                                        <div>{groupMembers[groupMemberRowIndex].surname}</div>
                                    </FieldContainer>                                    
                                    <FieldContainer>
                                        <label>Email</label>
                                        <div>{groupMembers[groupMemberRowIndex].email}</div>
                                    </FieldContainer>  
                                    <FieldContainer>
                                        <label>Username</label>
                                        <div>{groupMembers[groupMemberRowIndex].login}</div>
                                    </FieldContainer> 
                                    <FormikControl
                                        control='select'
                                        label='Role in group'
                                        name="roleInGroup"
                                        options={roleInGroupOptions}
                                        type='text'
                                        autoFocus={true}
                                    />
                                </ControlsContainer>
                                <FormButtonsProps onCancel={onCancel} isValid={formik.isValid} isSubmitting={formik.isSubmitting} />
                            </Form>
                        )
                    }
                </Formik>
            </FormContainer>
        </>
    )
}

export default EditGroupMember;