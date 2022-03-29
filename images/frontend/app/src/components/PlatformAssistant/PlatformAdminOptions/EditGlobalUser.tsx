import { FC, SyntheticEvent, useState } from 'react';
import styled from "styled-components";
import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import { useAuthState, useAuthDispatch } from '../../../contexts/authContext';
import { axiosAuth, axiosInstance, getDomainName } from "../../../tools/tools";
import { toast } from "react-toastify";
import FormikControl from "../../Tools/FormikControl";
import FormButtonsProps from "../../Tools/FormButtons";
import FormTitle from "../../Tools/FormTitle";
import {
    useGlobalUserIdToEdit,
    setGlobalUsersOptionToShow,
    useGlobalUserRowIndexToEdit,
    useGlobalUsersDispatch
} from '../../../contexts/globalUsersOptions';
import { GLOBAL_USERS_OPTIONS } from '../Utils/platformAssistantOptions';
import { IGlobalUser } from '../TableColumns/globalUsersColumns';


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

const domainName = getDomainName();

const platformAdminOptions = [
    {
        label: "Yes",
        value: true
    },
    {
        label: "No",
        value: false
    }
];


interface EditGlobalUserProps {
    globalUsers: IGlobalUser[];
    backToTable: () => void;
    refreshGlobalUsers: () => void;
}


const EditGlobalUser: FC<EditGlobalUserProps> = ({ globalUsers, backToTable, refreshGlobalUsers }) => {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();
    const globalUserDispatch = useGlobalUsersDispatch();
    const globalUserId = useGlobalUserIdToEdit();
    const globalUserRowIndex = useGlobalUserRowIndexToEdit();

    const onSubmit = (values: any, actions: any) => {
        const url = `https://${domainName}/admin_api/application/global_user/id/${globalUserId}`;
        const config = axiosAuth(accessToken);
        setIsSubmitting(true);
        axiosInstance(refreshToken, authDispatch)
            .patch(url, values, config)
            .then((response) => {
                const data = response.data;
                toast.success(data.message);
                const globalUsersOptionToShow = { globalUsersOptionToShow: GLOBAL_USERS_OPTIONS.TABLE };
                setIsSubmitting(false);
                setGlobalUsersOptionToShow(globalUserDispatch, globalUsersOptionToShow);
                refreshGlobalUsers();
            })
            .catch((error) => {
                const errorMessage = error.response.data.message;
                toast.error(errorMessage);
                backToTable();
            })
    }

    const initialGlobalUserData = {
        firstName: globalUsers[globalUserRowIndex].firstName,
        surname: globalUsers[globalUserRowIndex].surname,
        email: globalUsers[globalUserRowIndex].email,
        login: globalUsers[globalUserRowIndex].login,
        password: "",
        isGrafanaAdmin: globalUsers[globalUserRowIndex].roleInPlatform === "Admin" ? true : false
    }

    const validationSchema = Yup.object().shape({
        firstName: Yup.string().max(127, "The maximum number of characters allowed is 127").required('Required'),
        surname: Yup.string().max(127, "The maximum number of characters allowed is 127").required('Required'),
        email: Yup.string().email("Enter a valid email").max(190, "The maximum number of characters allowed is 190").required('Required'),
        login: Yup.string()
            .matches(/^[a-zA-Z0-9._-]*$/g, "Only the following characters are allowed for username: a-zA-Z0-9._-")
            .max(190, "The maximum number of characters allowed is 190")
            .required('Required'),
        password: Yup.string()
            .matches(/^[a-zA-Z0-9.-_\\@\\#\\$\\%]*$/g, "Only the following characters are allowed for password: a-zA-Z0-9.-_@#$%")
            .max(190, "The maximum number of characters allowed is 100"),
        isGrafanaAdmin: Yup.boolean().required('Required'),
    });

    const onCancel = (e: SyntheticEvent) => {
        e.preventDefault();
        backToTable();
    };

    return (
        <>
            <FormTitle isSubmitting={isSubmitting} >Edit global user</FormTitle>
            <FormContainer>
                <Formik initialValues={initialGlobalUserData} validationSchema={validationSchema} onSubmit={onSubmit} >
                    {
                        formik => (
                            <Form>
                                <ControlsContainer>
                                    <FormikControl
                                        control='input'
                                        label='First name'
                                        name='firstName'
                                        type='text'
                                    />
                                    <FormikControl
                                        control='input'
                                        label='Surname'
                                        name='surname'
                                        type='text'
                                    />
                                    <FormikControl
                                        control='input'
                                        label='Email'
                                        name='email'
                                        type='email'
                                    />
                                    <FormikControl
                                        control='input'
                                        label='Username'
                                        name='login'
                                        type='text'
                                    />
                                    <FormikControl
                                        control='input'
                                        label='Password'
                                        name='password'
                                        type='password'
                                    />
                                    <FormikControl
                                        control='select'
                                        label='Platform admin'
                                        name="isGrafanaAdmin"
                                        options={platformAdminOptions}
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

export default EditGlobalUser;