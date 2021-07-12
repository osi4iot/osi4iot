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
    setGroupsOptionToShow,
    useGroupIdToEdit,
    useGroupsDispatch,
    useGroupRowIndexToEdit
} from '../../contexts/groupsOptions';
import { GROUPS_OPTIONS } from './platformAssistantOptions';
import { IGroup } from './TableColumns/groupsColumns';


const FormContainer = styled.div`
	font-size: 12px;
    padding: 30px 20px;
    border: 3px solid #3274d9;
    border-radius: 20px;
    width: 420px;
`;

const ControlsContainer = styled.div`
    width: 100%;

    div:first-child {
        margin-top: 0;
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
const floorNumberWarning = "Floor number must an integer greater or equal to 0";

interface EditGroupProps {
    groups: IGroup[];
    backToTable: () => void;
    refreshGroups: () => void;
}

const EditGroup: FC<EditGroupProps> = ({ groups, backToTable, refreshGroups }) => {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();
    const groupsDispatch = useGroupsDispatch();
    const groupId = useGroupIdToEdit();
    const groupRowIndex = useGroupRowIndexToEdit();

    const onSubmit = (values: any, actions: any) => {
        const orgId = groups[groupRowIndex].orgId;
        const url = `https://${domainName}/admin_api/group/${orgId}/id/${groupId}`;
        const config = axiosAuth(accessToken);

        if (typeof (values as any).floorNumber === 'string') {
            (values as any).floorNumber = parseInt((values as any).floorNumber, 10);
        }

        if ((values as any).geoJsonData.trim() === "") {
            (values as any).geoJsonData = "{}";
        }

        setIsSubmitting(true);

        axiosInstance(refreshToken, authDispatch)
            .patch(url, values, config)
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
        name: groups[groupRowIndex].name,
        acronym: groups[groupRowIndex].acronym,
        folderPermission: groups[groupRowIndex].folderPermission,
        telegramInvitationLink: groups[groupRowIndex].telegramInvitationLink,
        telegramChatId: groups[groupRowIndex].telegramChatId,
        floorNumber: groups[groupRowIndex].floorNumber,
        geoJsonData: JSON.stringify(groups[groupRowIndex].geoJsonData, null, 4)
    }

    const validationSchema = Yup.object().shape({
        name: Yup.string().max(190, "The maximum number of characters allowed is 200").required('Required'),
        acronym: Yup.string().max(25, "The maximum number of characters allowed is 25").required('Required'),
        folderPermission: Yup.string().required('Required'),
        telegramInvitationLink: Yup.string().url("Enter a valid url").max(60, "The maximum number of characters allowed is 60").required('Required'),
        telegramChatId: Yup.string().max(15, "The maximum number of characters allowed is 15").required('Required'),
        floorNumber: Yup.number().integer(floorNumberWarning).moreThan(-1, floorNumberWarning).required('Required'),
        geoJsonData: Yup.string().required('Required'),
    });

    const onCancel = (e: SyntheticEvent) => {
        e.preventDefault();
        backToTable();
    };

    return (
        <>
            <FormTitle isSubmitting={isSubmitting} >Edit group</FormTitle>
            <FormContainer>
                <Formik initialValues={initialGroupData} validationSchema={validationSchema} onSubmit={onSubmit} >
                    {
                        formik => (
                            <Form>
                                <ControlsContainer>
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
                                        control='input'
                                        label='Floor number'
                                        name='floorNumber'
                                        type='text'
                                    />
                                    <FormikControl
                                        control='textarea'
                                        label='Geojson data'
                                        name='geoJsonData'
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

export default EditGroup;