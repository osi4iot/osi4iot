import { FC, useState, SyntheticEvent } from 'react';
import styled from "styled-components";
import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import { useAuthState, useAuthDispatch } from '../../../contexts/authContext';
import { axiosAuth, axiosInstance, getDomainName } from "../../../tools/tools";
import { toast } from "react-toastify";
import FormikControl from "../../Tools/FormikControl";
import FormButtonsProps from "../../Tools/FormButtons";
import FormTitle from "../../Tools/FormTitle";
import { MEASUREMENTS_OPTIONS } from '../Utils/platformAssistantOptions';
import { IMeasurement } from '../TableColumns/measurementsColumns';
import { setMeasurementsOptionToShow, useMeasurementRowIndexToEdit, useMeasurementsDispatch, useMeasurementTimestampToEdit } from '../../../contexts/measurementsOptions';


const FormContainer = styled.div`
	font-size: 12px;
    padding: 30px 20px;
    border: 3px solid #3274d9;
    border-radius: 20px;
    width: 500px;
`;

const ControlsContainer = styled.div`
    width: 100%;

    div:first-child {
        margin-top: 0;
    }
`;

const FieldContainer = styled.div`
    margin: 20px 0;

    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    align-items: flex-start;
    width: 100%;

    & label {
        font-size: 12px;
        margin: 0 0 5px 3px;
        width: 100%;
    }

    & div {
        font-size: 14px;
        background-color: #0c0d0f;
        border: 2px solid #2c3235;
        padding: 5px;
        margin-left: 2px;
        color: white;
        width: 100%;
    }
`;

const domainName = getDomainName();

interface EditMeasurementProps {
    groupId: number;
    measurements: IMeasurement[];
    backToTable: () => void;
    updateMeasurementsTable: (measurementsTable: IMeasurement[]) => void;
}

const EditMeasurement: FC<EditMeasurementProps> = ({ groupId, measurements, backToTable, updateMeasurementsTable }) => {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();
    const measurementsDispatch = useMeasurementsDispatch();
    const measurementRowIndex = useMeasurementRowIndexToEdit();
    const timestamp = useMeasurementTimestampToEdit();

    const onSubmit = (values: any, actions: any) => {
        const topic = measurements[measurementRowIndex].topic;
        const url = `${domainName}/admin_api/measurement/${groupId}`;
        const config = axiosAuth(accessToken);
        const updatedMesurement = {
            timestamp,
            topic,
            updatedPayload: values.payload
        };
        setIsSubmitting(true);

        axiosInstance(refreshToken, authDispatch)
            .patch(url, updatedMesurement, config)
            .then((response) => {
                const data = response.data;
                toast.success(data.message);
                const measurementsOptionToShow = { measurementsOptionToShow: MEASUREMENTS_OPTIONS.TABLE };
                setIsSubmitting(false);
                setMeasurementsOptionToShow(measurementsDispatch, measurementsOptionToShow);
                const newMesurementsTable = [...measurements];
                newMesurementsTable[measurementRowIndex].payload = data.payload;
                updateMeasurementsTable(newMesurementsTable);
            })
            .catch((error) => {
                const errorMessage = error.response.data.message;
                toast.error(errorMessage);
                backToTable();
            })
    }

    const initialMeasurementData = {
        payload: JSON.stringify(JSON.parse(measurements[measurementRowIndex].payload), null, 4)
    }

    const validationSchema = Yup.object().shape({
        payload: Yup.string().required('Required'),
    });

    const onCancel = (e: SyntheticEvent) => {
        e.preventDefault();
        backToTable();
    };

    return (
        <>
            <FormTitle isSubmitting={isSubmitting} >Edit measurement</FormTitle>
            <FormContainer>
                <Formik initialValues={initialMeasurementData} validationSchema={validationSchema} onSubmit={onSubmit} >
                    {
                        formik => (
                            <Form>
                                <ControlsContainer>
                                    <FieldContainer>
                                        <label>GroupId</label>
                                        <div>{groupId}</div>
                                    </FieldContainer>
                                    <FieldContainer>
                                        <label>Topic</label>
                                        <div>{measurements[measurementRowIndex].topic}</div>
                                    </FieldContainer>
                                    <FieldContainer>
                                        <label>Timestamp</label>
                                        <div>{timestamp}</div>
                                    </FieldContainer>
                                    <FormikControl
                                        control='textarea'
                                        label='Payload'
                                        name='payload'
                                    />
                                </ControlsContainer>
                                <FormButtonsProps
                                    onCancel={onCancel}
                                    isValid={formik.isValid}
                                    isSubmitting={formik.isSubmitting}
                                    isWideForm={true}
                                />
                            </Form>
                        )
                    }
                </Formik>
            </FormContainer>
        </>
    )
}

export default EditMeasurement;