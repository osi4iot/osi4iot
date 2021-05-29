import { FC, useState, SyntheticEvent } from 'react';
import styled from "styled-components";
import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import axios from "axios";
import { axiosAuth, getDomainName } from "../../tools/tools";
import { useAuthState } from "../../contexts/authContext";
import { toast } from "react-toastify";
import FormikControl from "../Tools/FormikControl";
import FormButtonsProps from "../Tools/FormButtons";
import FormTitle from "../Tools/FormTitle";
import { useGroupsDispatch, setGroupsOptionToShow } from '../../contexts/groups';
import { GROUPS_OPTIONS } from './platformAssistantOptions';


const FormContainer = styled.div`
	font-size: 12px;
    padding: 30px 10px 30px 20px;
    border: 3px solid #3274d9;
    border-radius: 20px;
    width: 400px;
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

interface CreateGroupProps {
    backToTable: () => void;
    refreshGroups: () => void;
}

const CreateGroup: FC<CreateGroupProps> = ({ backToTable, refreshGroups }) => {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { accessToken } = useAuthState();
    const groupsDispatch = useGroupsDispatch();

    const onSubmit = (values: any, actions: any) => {
        const orgId = values.orgId;
        const url = `https://${domainName}/admin_api/group/${orgId}`;
        const config = axiosAuth(accessToken);
        const groupData = {
            name: values.name,
            acronym: values.acronym,
            telegramInvitationLink: values.telegramInvitationLink,
            telegramChatId: values.telegramChatId,
            folderPermission: values.folderPermission,
            groupAdminDataArray: [...values.groupAdminDataArray]
        }
        setIsSubmitting(true);
        axios
            .post(url, groupData, config)
            .then((response) => {
                const data = response.data;
                toast.success(data.message);
                const groupsOptionToShow = { groupsOptionToShow: GROUPS_OPTIONS.TABLE };
                setIsSubmitting(false);
                setGroupsOptionToShow(groupsDispatch, groupsOptionToShow);
                refreshGroups();
            })
            .catch((error) => {
                const errorMessage = error.response.data.message;
                toast.error(errorMessage);
                backToTable();
            })
    }


    const initialGroupData = {
        orgId: 1,
        name: "",
        acronym: "",
        folderPermission: "Viewer",
        telegramInvitationLink: "",
        telegramChatId: "",
        groupAdminDataArray: [
            {
                firstName: "",
                surname: "",
                email: "",
            }
        ]
    }

    const validationSchema = Yup.object().shape({
        orgId: Yup.number().required('Required'),
        name: Yup.string().max(190,"The maximum number of characters allowed is 200").required('Required'),
        acronym: Yup.string().max(25,"The maximum number of characters allowed is 25").required('Required'),
        folderPermission: Yup.string().required('Required'),
        telegramInvitationLink: Yup.string().url("Enter a valid url").max(60,"The maximum number of characters allowed is 60").required('Required'),
        telegramChatId: Yup.string().max(15,"The maximum number of characters allowed is 15").required('Required'),
        groupAdminDataArray: Yup.array()
            .of(
                Yup.object().shape({
                    firstName: Yup.string().max(127,"The maximum number of characters allowed is 127").required('Required'),
                    surname: Yup.string().max(127,"The maximum number of characters allowed is 127").required('Required'),
                    email: Yup.string().email("Enter a valid email").max(190,"The maximum number of characters allowed is 190").required('Required')
                })
            )
            .required('Must have org admin') // these constraints are shown if and only if inner constraints are satisfied
            .min(1, 'Must be at least one org amdin')
    });

    const onCancel = (e: SyntheticEvent) => {
        e.preventDefault();
        backToTable();
    };

    return (
        <>
            <FormTitle isSubmitting={isSubmitting}>Create group</FormTitle>
            <FormContainer>
                <Formik initialValues={initialGroupData} validationSchema={validationSchema} onSubmit={onSubmit} >
                    {
                        formik => (
                            <Form>
                                <ControlsContainer>
                                    <FormikControl
                                        control='input'
                                        label='OrgId'
                                        name='orgId'
                                        type='text'
                                    />
                                    <FormikControl
                                        control='input'
                                        label='Group name'
                                        name='name'
                                        type='text'
                                    />
                                    <FormikControl
                                        control='input'
                                        label='Group acronym'
                                        name='acronym'
                                        type='text'
                                    />
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
                                    <FormikControl
                                        control='inputArray'
                                        label='Group admins'
                                        name='groupAdminDataArray'
                                        labelArray={['First name', 'Surname', 'Email']}
                                        nameArray={['firstName', 'surname', 'email']}
                                        typeArray={['text', 'text', 'email']}
                                        addLabel="group admim"
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

export default CreateGroup;