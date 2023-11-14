import { FC, useState, SyntheticEvent } from 'react';
import styled from "styled-components";
import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import { useAuthState, useAuthDispatch } from '../../../contexts/authContext';
import { axiosAuth, getDomainName, getProtocol } from "../../../tools/tools";
import { toast } from "react-toastify";
import FormikControl from "../../Tools/FormikControl";
import FormButtonsProps from "../../Tools/FormButtons";
import FormTitle from "../../Tools/FormTitle";
import { getAxiosInstance } from '../../../tools/axiosIntance';
import axiosErrorHandler from '../../../tools/axiosErrorHandler';


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
const protocol = getProtocol();

interface CreateGlobalUserProps {
    backToTable: () => void;
    refreshGlobalUsers: () => void;
}

const CreateGlobalUser: FC<CreateGlobalUserProps> = ({ backToTable, refreshGlobalUsers }) => {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();

    const initialGlobalUsersData = {
        users: [
            {
                firstName: "",
                surname: "",
                email: "",
                login: "",
                password: ""
            }
        ]
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
                        .max(190, "The maximum number of characters allowed is 190")
                })
            )
            .required('Must have org admin') // these constraints are shown if and only if inner constraints are satisfied
            .min(1, 'Must be at least one org amdin')
    });

    const onSubmit = (values: {}, actions: any) => {
        const url = `${protocol}://${domainName}/admin_api/application/global_users`;
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
                refreshGlobalUsers();
            })
    }

    const onCancel = (e: SyntheticEvent) => {
        e.preventDefault();
        backToTable();
    };

    return (
        <>
            <FormTitle isSubmitting={isSubmitting} >Create global users</FormTitle>
            <FormContainer>
                <Formik initialValues={initialGlobalUsersData} validationSchema={validationSchema} onSubmit={onSubmit} >
                    {
                        formik => (
                            <Form>
                                <ControlsContainer>
                                    <FormikControl
                                        control='inputArrayRows'
                                        label='Global user'
                                        name='users'
                                        labelArray={['First name *', 'Surname *', 'Email *', 'Username', 'Password']}
                                        nameArray={['firstName', 'surname', 'email', 'login', 'password']}
                                        typeArray={['text', 'text', 'email', 'text', 'password']}
                                        addLabel="global user"
                                    />
                                </ControlsContainer>
                                <FormButtonsProps onCancel={onCancel} isValid={formik.isValid} isSubmitting={formik.isSubmitting} isWideForm={true} />
                            </Form>
                        )
                    }
                </Formik>
            </FormContainer>
        </>
    )
}

export default CreateGlobalUser;