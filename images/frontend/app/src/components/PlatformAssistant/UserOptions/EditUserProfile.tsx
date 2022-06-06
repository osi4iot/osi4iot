import { FC, useState, useEffect, SyntheticEvent } from "react";
import styled from "styled-components";
import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import { useAuthState, useAuthDispatch } from '../../../contexts/authContext';
import { axiosAuth, axiosInstance, getDomainName, getProtocol } from "../../../tools/tools";
import { toast } from "react-toastify";
import FormikControl from "../../Tools/FormikControl";
import FormButtonsProps from "../../Tools/FormButtons";
import FormTitle from "../../Tools/FormTitle";
import { IUserProfile } from "./UserProfile";

const FormContainer = styled.div`
	font-size: 12px;
    padding: 10px 20px 30px 20px;
    width: 300px;
    border: 3px solid #3274d9;
    border-radius: 20px;
`;


interface EditUserProfileProps {
    userProfileToEdit: IUserProfile;
    refreshUserProfile: () => void;
    backToUserProfile: () => void;
}

const domainName = getDomainName();
const protocol = getProtocol();

const EditUserProfile: FC<EditUserProfileProps> = ({  userProfileToEdit, refreshUserProfile, backToUserProfile }) => {
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [userProfileUpdated, setUserProfileUpdated] = useState(false);
    const validationSchema = Yup.object({
        firstName: Yup.string().required('Required'),
        surname: Yup.string().required('Required'),
        login: Yup.string().required('Required'),
        email: Yup.string().email("Enter a valid email").required('Required'),
    });

    useEffect(() => {
        if(userProfileUpdated) refreshUserProfile();
    }, [userProfileUpdated, refreshUserProfile]);
    
    const onSubmit = (values: {}, actions: any) => {
        const url = `${protocol}://${domainName}/admin_api/auth/user_profile`;
        const config = axiosAuth(accessToken);
        setIsSubmitting(true);
        axiosInstance(refreshToken, authDispatch)
            .patch(url, values, config)
            .then((response) => {
                const data = response.data;
                toast.success(data.message);
                setIsSubmitting(false);
                setUserProfileUpdated(true);
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
            <FormTitle isSubmitting={isSubmitting}>Edit user profile</FormTitle>
            <FormContainer>
                <Formik initialValues={userProfileToEdit} validationSchema={validationSchema} onSubmit={onSubmit} >
                    {
                        formik => (
                            <Form>
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
                                    label='Username'
                                    name='login'
                                    type='text'
                                />
                                <FormikControl
                                    control='input'
                                    label='Email'
                                    name='email'
                                    type='email'
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

export default EditUserProfile;