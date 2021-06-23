import { FC, useState, SyntheticEvent } from "react";
import styled from "styled-components";
import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import FormikControl from "../Tools/FormikControl";
import { axiosAuth, axiosInstance, getDomainName } from "../../tools/tools";
import { useAuthState, useAuthDispatch } from '../../contexts/authContext';
import { toast } from "react-toastify";
import FormButtonsProps from "../Tools/FormButtons";
import FormTitle from "../Tools/FormTitle"

const FormContainer = styled.div`
	font-size: 12px;
    padding: 10px 20px 30px 20px;
    width: 300px;
    border: 3px solid #3274d9;
    border-radius: 20px;
`;


interface ChangePasswordProps {
    backToUserProfile: () => void;
}

const domainName = getDomainName();

interface IChangePassword {
    oldPassword: string;
    newPassword: string;
    confirmPassword: string;
}

const ChangePassword: FC<ChangePasswordProps> = ({ backToUserProfile }) => {
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const validationSchema = Yup.object({
        oldPassword: Yup.string().required('Required'),
        newPassword: Yup.string().required('Required'),
        confirmPassword: Yup.string().oneOf([Yup.ref('newPassword'), null], "Passwords don't match!"),
    });

    
    const onSubmit = (values: IChangePassword, actions: any) => {
        const url = `https://${domainName}/admin_api/auth/change_password`;
        const config = axiosAuth(accessToken);
        const passwordData = { oldPassword: values.oldPassword, newPassword: values.newPassword }
        setIsSubmitting(true);
        axiosInstance(refreshToken, authDispatch)
            .patch(url, passwordData, config)
            .then((response) => {
                const data = response.data;
                toast.success(data.message);
                setIsSubmitting(false);
                backToUserProfile();
            })
            .catch((error) => {
                const errorMessage = error.response.data.message;
                toast.error(errorMessage);
                backToUserProfile();
            })
    };

    const onCancel = (e: SyntheticEvent) => {
        e.preventDefault();
        backToUserProfile();
    };

    return (
        <>
            <FormTitle isSubmitting={isSubmitting} >Change user password</FormTitle>
            <FormContainer>
                <Formik initialValues={{ oldPassword: "", newPassword: "", confirmPassword: "" }} validationSchema={validationSchema} onSubmit={onSubmit} >
                    {
                        formik => (
                            <Form>
                                <FormikControl
                                    control='input'
                                    label='Old password'
                                    name='oldPassword'
                                    type='password'
                                />
                                <FormikControl
                                    control='input'
                                    label='New password'
                                    name='newPassword'
                                    type='password'
                                />
                                <FormikControl
                                    control='input'
                                    label='Confirm password'
                                    name='confirmPassword'
                                    type='password'
                                />
                                <FormButtonsProps onCancel={onCancel} isValid={formik.isValid} isSubmitting={formik.isSubmitting} />
                            </Form>
                        )
                    }
                </Formik>
            </FormContainer>
        </>

    )
}

export default ChangePassword;