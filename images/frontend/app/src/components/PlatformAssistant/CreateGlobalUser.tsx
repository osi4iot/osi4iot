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
import { setGlobalUsersOptionToShow, useGlobalUsersDispatch } from '../../contexts/globalUsers';
import { GLOBAL_USERS_OPTIONS } from './platformAssistantOptions';


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

interface CreateGlobalUserProps {
    backToTable: () => void;
    refreshGlobalUsers: () => void;
}

const CreateGlobalUser: FC<CreateGlobalUserProps> = ({ backToTable, refreshGlobalUsers }) => {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { accessToken } = useAuthState();
    const globalUsersDispatch = useGlobalUsersDispatch();

    const initialGlobalUsersData = {
        globalUsersArray: [
            {
                firstName: "",
                surname: "",
                email: "",
                login: "",
                password: "",
                telegramId: ""
            }
        ]
    }

    const validationSchema = Yup.object().shape({
        globalUsersArray: Yup.array()
            .of(
                Yup.object().shape({
                    firstName: Yup.string().max(127, "The maximum number of characters allowed is 127").required('Required'),
                    surname: Yup.string().max(127, "The maximum number of characters allowed is 127").required('Required'),
                    email: Yup.string().email("Enter a valid email").max(190, "The maximum number of characters allowed is 190").required('Required'),
                    login: Yup.string().max(190, "The maximum number of characters allowed is 190"),
                    telegramId: Yup.string().max(200, "The maximum number of characters allowed is 200")
                })
            )
            .required('Must have org admin') // these constraints are shown if and only if inner constraints are satisfied
            .min(1, 'Must be at least one org amdin')
    });

    const onSubmit = (values: {}, actions: any) => {
        const url = `https://${domainName}/admin_api/organization`;
        const config = axiosAuth(accessToken);
        setIsSubmitting(true);
        axios
            .post(url, values, config)
            .then((response) => {
                const data = response.data;
                toast.success(data.message);
                const globalUsersOptionToShow = { globalUsersOptionToShow: GLOBAL_USERS_OPTIONS.TABLE };
                setGlobalUsersOptionToShow(globalUsersDispatch, globalUsersOptionToShow);
                refreshGlobalUsers();
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
            <FormTitle isSubmitting={isSubmitting} >Create global user</FormTitle>
            <FormContainer>
                <Formik initialValues={initialGlobalUsersData} validationSchema={validationSchema} onSubmit={onSubmit} >
                    {
                        formik => (
                            <Form>
                                <ControlsContainer>
                                    <FormikControl
                                        control='inputArrayRows'
                                        label='Global user'
                                        name='globalUsersArray'
                                        labelArray={['First name *', 'Surname *', 'Email *', 'Username', 'Password', 'TelegramId']}
                                        nameArray={['firstName', 'surname', 'email', 'login', 'password', 'telegramId']}
                                        typeArray={['text', 'text', 'email', 'text', 'password', 'text']}
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