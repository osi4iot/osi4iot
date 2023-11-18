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
import { SENSORS_OPTIONS } from '../Utils/platformAssistantOptions';
import {
    setSensorsOptionToShow,
    useSensorIdToEdit,
    useSensorRowIndexToEdit,
    useSensorsDispatch
} from '../../../contexts/sensorsOptions';
import { ISensor } from '../TableColumns/sensorsColumns';
import { getAxiosInstance } from '../../../tools/axiosIntance';
import axiosErrorHandler from '../../../tools/axiosErrorHandler';


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
const protocol = getProtocol();

interface EdiSensorProps {
    sensors: ISensor[];
    backToTable: () => void;
    refreshSensors: () => void;
}

const EditSensor: FC<EdiSensorProps> = ({ sensors, backToTable, refreshSensors }) => {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();
    const sensorsDispatch = useSensorsDispatch();
    const sensorRowIndex = useSensorRowIndexToEdit();
    const sensorId = useSensorIdToEdit();

    const onSubmit = (values: any, actions: any) => {
        const groupId = sensors[sensorRowIndex].groupId;
        const url = `${protocol}://${domainName}/admin_api/sensor/${groupId}/id/${sensorId}`;
        const config = axiosAuth(accessToken);
        setIsSubmitting(true);

        getAxiosInstance(refreshToken, authDispatch)
            .patch(url, values, config)
            .then((response) => {
                const data = response.data;
                toast.success(data.message);
                const sensorsOptionToShow = { sensorsOptionToShow: SENSORS_OPTIONS.TABLE };
                setIsSubmitting(false);
                setSensorsOptionToShow(sensorsDispatch, sensorsOptionToShow);
            })
            .catch((error) => {
                axiosErrorHandler(error, authDispatch);
                backToTable();
            })
            .finally(() => {
                refreshSensors();
            })
    }


    const initialSensorData = {
        description: sensors[sensorRowIndex].description,
        topicId: sensors[sensorRowIndex].topicId,
        payloadJsonSchema: sensors[sensorRowIndex].payloadJsonSchema,
    }

    const validationSchema = Yup.object().shape({
        description: Yup.string().max(190, "The maximum number of characters allowed is 190").required('Required'),
        payloadJsonSchema: Yup.string().required('Required'),
    });

    const onCancel = (e: SyntheticEvent) => {
        e.preventDefault();
        backToTable();
    };

    return (
        <>
            <FormTitle isSubmitting={isSubmitting} >Edit sensor</FormTitle>
            <FormContainer>
                <Formik initialValues={initialSensorData} validationSchema={validationSchema} onSubmit={onSubmit} >
                    {
                        formik => (
                            <Form>
                                <ControlsContainer>
                                    <FormikControl
                                        control='input'
                                        label='TopicId'
                                        name='topicId'
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
                                        label='Payload json schema'
                                        name='payloadJsonSchema'
                                        textAreaSize='Small'
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

export default EditSensor;