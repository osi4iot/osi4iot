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
import { setTopicsOptionToShow, useTopicIdToEdit, useTopicRowIndexToEdit, useTopicsDispatch } from '../../contexts/topicsOptions';
import { ITopic } from './TableColumns/topicsColumns';


const FormContainer = styled.div`
	font-size: 12px;
    padding: 30px 20px;
    border: 3px solid #3274d9;
    border-radius: 20px;
    width: 350px;
`;

const ControlsContainer = styled.div`
    width: 100%;

    div:first-child {
        margin-top: 0;
    }
`;


const domainName = getDomainName();

interface EdiTopicProps {
    topics: ITopic[];
    backToTable: () => void;
    refreshTopics: () => void;
}

const EditTopic: FC<EdiTopicProps> = ({ topics, backToTable, refreshTopics }) => {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();
    const topicsDispatch = useTopicsDispatch();
    const topicRowIndex = useTopicRowIndexToEdit();
    const topicId = useTopicIdToEdit();

    const onSubmit = (values: any, actions: any) => {
        const groupId = topics[topicRowIndex].groupId;
        const deviceId = topics[topicRowIndex].deviceId;
        const url = `https://${domainName}/admin_api/topic/${groupId}/${deviceId}/${topicId}`;
        const config = axiosAuth(accessToken);
        setIsSubmitting(true);

        axiosInstance(refreshToken, authDispatch)
            .patch(url, values, config)
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
        sensorName: topics[topicRowIndex].sensorName,
        description: topics[topicRowIndex].description,
        sensorType: topics[topicRowIndex].sensorType,
        payloadFormat: JSON.stringify(JSON.parse(topics[topicRowIndex].payloadFormat), null, 4)
    }

    const validationSchema = Yup.object().shape({
        sensorName: Yup.string().max(190, "The maximum number of characters allowed is 190").required('Required'),
        description: Yup.string().max(190, "The maximum number of characters allowed is 190").required('Required'),
        sensorType: Yup.string().max(40, "The maximum number of characters allowed is 40").required('Required'),
        payloadFormat: Yup.string().required('Required'),
    });

    const onCancel = (e: SyntheticEvent) => {
        e.preventDefault();
        backToTable();
    };

    return (
        <>
            <FormTitle isSubmitting={isSubmitting} >Edit topic</FormTitle>
            <FormContainer>
                <Formik initialValues={initialTopicData} validationSchema={validationSchema} onSubmit={onSubmit} >
                    {
                        formik => (
                            <Form>
                                <ControlsContainer>
                                    <FormikControl
                                        control='input'
                                        label='Sensor name'
                                        name='sensorName'
                                        type='text'
                                    />
                                    <FormikControl
                                        control='input'
                                        label='Description'
                                        name='description'
                                        type='text'
                                    />
                                    <FormikControl
                                        control='input'
                                        label='Sensor type'
                                        name='sensorType'
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

export default EditTopic;