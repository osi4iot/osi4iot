import { FC, useState, SyntheticEvent } from 'react';
import styled from "styled-components";
import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import { axiosAuth, getDomainName, getProtocol } from "../../../tools/tools";
import { useAuthDispatch, useAuthState } from "../../../contexts/authContext";
import { toast } from "react-toastify";
import FormikControl from "../../Tools/FormikControl";
import FormButtonsProps from "../../Tools/FormButtons";
import FormTitle from "../../Tools/FormTitle";
import { GROUPS_MANAGED_OPTIONS } from '../Utils/platformAssistantOptions';
import { IOrgOfGroupsManaged } from '../TableColumns/orgsOfGroupsManagedColumns';
import { IGroupManaged } from '../TableColumns/groupsManagedColumns';
import {
    setGroupManagedInputFormData,
    setGroupsManagedOptionToShow,
    useGroupManagedIdToEdit,
    useGroupManagedInputFormData,
    useGroupManagedRowIndex,
    useGroupsManagedDispatch
} from '../../../contexts/groupsManagedOptions';
import { getAxiosInstance } from '../../../tools/axiosIntance';
import axiosErrorHandler from '../../../tools/axiosErrorHandler';
import { ControlsContainer, FormContainer } from './CreateAsset';
import { AxiosResponse, AxiosError } from 'axios';

const groupManagedInitInputFormData = {
    groupId: 0,
    name: "",
    acronym: "",
    orgId: 0,
    folderPermission: "Viewer",
    telegramInvitationLink: "",
    telegramChatId: "",
}

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

const folderPermissionOptions = [
    {
        label: "Viewer",
        value: "Viewer"
    },
    {
        label: "Editor",
        value: "Editor"
    }
];


const domainName = getDomainName();
const protocol = getProtocol();

interface EditGroupManagedProps {
    orgsOfGroupManaged: IOrgOfGroupsManaged[];
    groupsManaged: IGroupManaged[];
    backToTable: () => void;
    selectLocationOption: () => void;
    refreshGroupsManaged: () => void;
}

const EditGroupManaged: FC<EditGroupManagedProps> = ({
    orgsOfGroupManaged,
    groupsManaged,
    backToTable,
    selectLocationOption,
    refreshGroupsManaged
}) => {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();
    const groupsManagedDispatch = useGroupsManagedDispatch();
    const groupManagedId = useGroupManagedIdToEdit();
    const groupManagedRowIndex = useGroupManagedRowIndex();
    const initialGroupManagedData = useGroupManagedInputFormData();

    const onSubmit = (values: any, actions: any) => {
        const url = `${protocol}://${domainName}/admin_api/group_user_managed/${groupManagedId}`;
        const config = axiosAuth(accessToken);
        setIsSubmitting(true);

        const groupManagedUpdateData = {
            folderPermission: values.folderPermission,
            telegramInvitationLink: values.telegramInvitationLink,
            telegramChatId: values.telegramChatId,
        }

        getAxiosInstance(refreshToken, authDispatch)
            .patch(url, groupManagedUpdateData, config)
            .then((response: AxiosResponse<any, any>) => {
                const data = response.data;
                toast.success(data.message);
                const groupsManagedOptionToShow = { groupsManagedOptionToShow: GROUPS_MANAGED_OPTIONS.TABLE };
                setIsSubmitting(false);
                setGroupsManagedOptionToShow(groupsManagedDispatch, groupsManagedOptionToShow);
            })
            .catch((error: AxiosError) => {
                axiosErrorHandler(error, authDispatch);
                backToTable();
            })
            .finally(() => {
                refreshGroupsManaged();
            })
    }

    const validationSchema = Yup.object().shape({
        folderPermission: Yup.string().required('Required'),
        telegramInvitationLink: Yup.string().url("Enter a valid url").max(60, "The maximum number of characters allowed is 60").required('Required'),
        telegramChatId: Yup.string().max(15, "The maximum number of characters allowed is 15").required('Required'),
    });

    const onCancel = (e: SyntheticEvent) => {
        e.preventDefault();
        const groupManagedInputFormData = { groupManagedInputFormData: groupManagedInitInputFormData };
        setGroupManagedInputFormData(groupsManagedDispatch, groupManagedInputFormData);
        backToTable();
    };

    return (
        <>
            <FormTitle isSubmitting={isSubmitting} >Edit group managed</FormTitle>
            <FormContainer>
                <Formik initialValues={initialGroupManagedData} validationSchema={validationSchema} onSubmit={onSubmit} >
                    {
                        formik => (
                            <Form>
                                <ControlsContainer>
                                    <FieldContainer>
                                        <label>GroupId</label>
                                        <div>{groupManagedId}</div>
                                    </FieldContainer>
                                    <FieldContainer>
                                        <label>OrgId</label>
                                        <div>{groupsManaged[groupManagedRowIndex].orgId}</div>
                                    </FieldContainer>
                                    <FieldContainer>
                                        <label>Name</label>
                                        <div>{groupsManaged[groupManagedRowIndex].name}</div>
                                    </FieldContainer>
                                    <FieldContainer>
                                        <label>Acronym</label>
                                        <div>{groupsManaged[groupManagedRowIndex].acronym}</div>
                                    </FieldContainer>
                                    <FieldContainer>
                                        <label>Mqtt access control</label>
                                        <div>{groupsManaged[groupManagedRowIndex].mqttAccessControl}</div>
                                    </FieldContainer>
                                    <FormikControl
                                        control='select'
                                        label='Folder permission'
                                        name="folderPermission"
                                        options={folderPermissionOptions}
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

export default EditGroupManaged;