import { FC, useState, SyntheticEvent } from 'react';
import styled from "styled-components";
import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import { useAuthState, useAuthDispatch } from '../../../contexts/authContext';
import { axiosAuth, axiosInstance, getDomainName, getProtocol } from "../../../tools/tools";
import { toast } from "react-toastify";
import FormikControl from "../../Tools/FormikControl";
import FormButtonsProps from "../../Tools/FormButtons";
import FormTitle from "../../Tools/FormTitle";
import { TOPICS_OPTIONS } from '../Utils/platformAssistantOptions';
import {
    setTopicsOptionToShow,
    useTopicIdToEdit,
    useTopicRowIndexToEdit,
    useTopicsDispatch
} from '../../../contexts/topicsOptions';
import { ITopic } from '../TableColumns/topicsColumns';


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

const topicTypeOptions = [
    {
        label: "Device to platform DB",
        value: "dev2pdb"
    },
    {
        label: "Device to DT",
        value: "dev2dtm"
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
const protocol = getProtocol();

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
        const url = `${protocol}://${domainName}/admin_api/topic/${groupId}/${deviceId}/${topicId}`;
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
                if(errorMessage !== "jwt expired") toast.error(errorMessage);
                backToTable();
            })
    }


    const initialTopicData = {
        topicType: topics[topicRowIndex].topicType,
        topicName: topics[topicRowIndex].topicName,
        description: topics[topicRowIndex].description,
        payloadFormat: JSON.stringify(JSON.parse(topics[topicRowIndex].payloadFormat), null, 4)
    }

    const validationSchema = Yup.object().shape({
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
            <FormTitle isSubmitting={isSubmitting} >Edit topic</FormTitle>
            <FormContainer>
                <Formik initialValues={initialTopicData} validationSchema={validationSchema} onSubmit={onSubmit} >
                    {
                        formik => (
                            <Form>
                                <ControlsContainer>
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

export default EditTopic;