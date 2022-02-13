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
import { TOPICS_OPTIONS } from './platformAssistantOptions';
import { setTopicsOptionToShow, useTopicsDispatch } from '../../contexts/topicsOptions';


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
        label: "Simulated device to DT",
        value: "dev_sim_2dtm"
    },
    {
        label: "DTM assets state to plaform database",
        value: "dtm_as2pdb"
    },
    {
        label: "DTM simulated assets state to DTS",
        value: "dtm_sim_as2dts"
    },
    {
        label: "DTM fem modal value to platform database",
        value: "dtm_fmv2pdb"
    },
    {
        label: "DTM simulated fem modal value to DTS",
        value: "dtm_sim_fmv2dts"
    }   
];


const domainName = getDomainName();

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
        const deviceId = values.deviceId;
        const url = `https://${domainName}/admin_api/topic/${groupId}/${deviceId}`;
        const config = axiosAuth(accessToken);

        const topicData = {
            topicType: values.topicType,
            topicName: values.topicName,
            description: values.description,
            payloadFormat: values.payloadFormat,
        }

        setIsSubmitting(true);
        axiosInstance(refreshToken, authDispatch)
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
                const errorMessage = error.response.data.message;
                toast.error(errorMessage);
                backToTable();
            })
    }


    const initialTopicData = {
        groupId: "",
        deviceId: "",
        topicType: "dev2pdb",
        topicName: "",
        description: "",
        payloadFormat: "{}"
    }

    const validationSchema = Yup.object().shape({
        groupId: Yup.number().required('Required'),
        deviceId: Yup.number().required('Required'),
        topicType: Yup.string().max(40, "The maximum number of characters allowed is 40").required('Required'),
        topicName: Yup.string().max(190, "The maximum number of characters allowed is 190").required('Required'),
        description: Yup.string().max(190, "The maximum number of characters allowed is 190").required('Required'),
        payloadFormat: Yup.string().required('Required'),
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
                                        control='input'
                                        label='DeviceId'
                                        name='deviceId'
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
                                        label='Topic name'
                                        name='topicName'
                                        type='text'
                                    />
                                    <FormikControl
                                        control='input'
                                        label='Description'
                                        name='description'
                                        type='text'
                                    />
                                    <FormikControl
                                        control='textarea'
                                        label='Payload format'
                                        name='payloadFormat'
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