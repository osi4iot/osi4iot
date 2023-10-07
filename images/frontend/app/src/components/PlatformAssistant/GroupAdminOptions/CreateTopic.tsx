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
import { TOPICS_OPTIONS } from '../Utils/platformAssistantOptions';
import { setTopicsOptionToShow, useTopicsDispatch } from '../../../contexts/topicsOptions';
import { getAxiosInstance } from '../../../tools/axiosIntance';
import axiosErrorHandler from '../../../tools/axiosErrorHandler';


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

    div:last-child {
        margin-bottom: 3px;
    }
`;

const topicTypeOptions = [
    {
        label: "Device to platform DB",
        value: "dev2pdb"
    },
    {
        label: "Device to platform DB message array",
        value: "dev2pdb_ma"
    },    
    {
        label: "Device to platform DB with timestamp",
        value: "dev2pdb_wt"
    },
    {
        label: "Device to DTM",
        value: "dev2dtm"
    },
    {
        label: "DTM to device",
        value: "dtm2dev"
    },
    {
        label: "Device to simulator",
        value: "dev2sim"
    },    
    {
        label: "DTM to simulator",
        value: "dtm2sim"
    },
    {
        label: "Simulator to DTM",
        value: "sim2dtm"
    },
    {
        label: "DTM to platform database",
        value: "dtm2pdb"
    },
    {
        label: "Test topic",
        value: "test"
    }
];

const mqttAccessControlOptions = [
    {
        label: "Subscribe & Publish",
        value: "Pub & Sub"
    },
    {
        label: "Subscribe",
        value: "Sub"
    },
    {
        label: "Publish",
        value: "Pub"
    },
    {
        label: "None",
        value: "None"
    }
];


const domainName = getDomainName();
const protocol = getProtocol();

interface CreateTopicProps {
    backToTable: () => void;
    refreshTopics: () => void;
}

const CreateTopic: FC<CreateTopicProps> = ({ backToTable, refreshTopics }) => {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();
    const topicsDispatch = useTopicsDispatch();

    const onSubmit = (values: any, actions: any) => {
        const groupId = values.groupId;
        const url = `${protocol}://${domainName}/admin_api/topic/${groupId}`;
        const config = axiosAuth(accessToken);

        const topicData = {
            topicType: values.topicType,
            description: values.description,
            mqttAccessControl: values.mqttAccessControl
        }

        setIsSubmitting(true);
        getAxiosInstance(refreshToken, authDispatch)
            .post(url, topicData, config)
            .then((response) => {
                const data = response.data;
                toast.success(data.message);
                const topicsOptionToShow = { topicsOptionToShow: TOPICS_OPTIONS.TABLE };
                setIsSubmitting(false);
                setTopicsOptionToShow(topicsDispatch, topicsOptionToShow);
                refreshTopics();
            })
            .catch((error) => {
                axiosErrorHandler(error, authDispatch);
                backToTable();
            })
    }


    const initialTopicData = {
        groupId: "",
        topicType: "dev2pdb",
        description: "",
        mqttAccessControl: "Pub & Sub"
    }

    const validationSchema = Yup.object().shape({
        groupId: Yup.number().required('Required'),
        topicType: Yup.string().max(40, "The maximum number of characters allowed is 40").required('Required'),
        description: Yup.string().max(190, "The maximum number of characters allowed is 190").required('Required'),
    });

    const onCancel = (e: SyntheticEvent) => {
        e.preventDefault();
        backToTable();
    };

    return (
        <>
            <FormTitle isSubmitting={isSubmitting}>Create topic</FormTitle>
            <FormContainer>
                <Formik initialValues={initialTopicData} validationSchema={validationSchema} onSubmit={onSubmit} >
                    {
                        formik => (
                            <Form>
                                <ControlsContainer>
                                    <FormikControl
                                        control='input'
                                        label='GroupId'
                                        name='groupId'
                                        type='text'
                                    />
                                    <FormikControl
                                        control='select'
                                        label='Topic type'
                                        name='topicType'
                                        options={topicTypeOptions}
                                        type='text'
                                    />
                                    <FormikControl
                                        control='input'
                                        label='Description'
                                        name='description'
                                        type='text'
                                    />
                                    <FormikControl
                                        control='select'
                                        label='Mqtt access control'
                                        name="mqttAccessControl"
                                        options={mqttAccessControlOptions}
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

export default CreateTopic;