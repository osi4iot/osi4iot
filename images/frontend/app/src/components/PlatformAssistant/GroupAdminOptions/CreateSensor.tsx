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
import { setSensorsOptionToShow, useSensorsDispatch } from '../../../contexts/sensorsOptions';
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


const domainName = getDomainName();
const protocol = getProtocol();

interface CreateSensorProps {
    backToTable: () => void;
    refreshSensors: () => void;
}

const CreateSensor: FC<CreateSensorProps> = ({ backToTable, refreshSensors }) => {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();
    const sensorsDispatch = useSensorsDispatch();

    const onSubmit = (values: any, actions: any) => {
        const groupId = values.groupId;
        const assetId = values.assetId;
        const url = `${protocol}://${domainName}/admin_api/sensor/${groupId}/${assetId}`;
        const config = axiosAuth(accessToken);

        const sensorData = {
            description: values.description,
            topicId: parseInt(values.topicId, 10),
            payloadKey: values.payloadKey,
            paramLabel: values.paramLabel,
            valueType: values.valueType,
            units: values.units,
            dashboardRefresh: values.dashboardRefresh,
            dashboardTimeWindow: values.dashboardTimeWindow,
        }

        setIsSubmitting(true);
        getAxiosInstance(refreshToken, authDispatch)
            .post(url, sensorData, config)
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
        groupId: "",
        assetId: "",
        description: "",
        topicId: "",
        payloadKey: "",
        paramLabel: "",
        valueType: "number",
        units: "",
        dashboardRefresh: "1s",
        dashboardTimeWindow: "5m"
    }

    const validationSchema = Yup.object().shape({
        groupId: Yup.number().required('Required'),
        assetId: Yup.number().required('Required'),
        topicId: Yup.number().required('Required'),
        description: Yup.string().max(190, "The maximum number of characters allowed is 190").required('Required'),
        payloadKey: Yup.string().required('Required'),
        paramLabel: Yup.string().required('Required'),
        valueType: Yup.string().required('Required'),
        units: Yup.string().required('Required'),
        dashboardRefresh: Yup.string().required('Required'),
        dashboardTimeWindow: Yup.string().required('Required'),
    });

    const onCancel = (e: SyntheticEvent) => {
        e.preventDefault();
        backToTable();
    };

    return (
        <>
            <FormTitle isSubmitting={isSubmitting}>Create sensor</FormTitle>
            <FormContainer>
                <Formik initialValues={initialSensorData} validationSchema={validationSchema} onSubmit={onSubmit} >
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
                                        label='AssetId'
                                        name='assetId'
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
                                        label='TopicId'
                                        name='topicId'
                                        type='text'
                                    />
                                    <FormikControl
                                        control='input'
                                        label='Payload key'
                                        name='payloadKey'
                                        type='text'
                                    />
                                    <FormikControl
                                        control='input'
                                        label='Key label'
                                        name='paramLabel'
                                        type='text'
                                    />
                                    <FormikControl
                                        control='input'
                                        label='Value type'
                                        name='valueType'
                                        type='text'
                                    />
                                    <FormikControl
                                        control='input'
                                        label='Units'
                                        name='units'
                                        type='text'
                                    />
                                    <FormikControl
                                        control='input'
                                        label='Dashboard refresh time'
                                        name='dashboardRefresh'
                                        type='text'
                                    />
                                    <FormikControl
                                        control='input'
                                        label='Dashboard time window'
                                        name='dashboardTimeWindow'
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

export default CreateSensor;