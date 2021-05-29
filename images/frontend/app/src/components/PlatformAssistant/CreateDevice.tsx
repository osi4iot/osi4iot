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
import { useDevicesDispatch, setDevicesOptionToShow } from '../../contexts/devices';
import { DEVICES_OPTIONS } from './platformAssistantOptions';


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

interface CreateDeviceProps {
    backToTable: () => void;
    refreshDevices: () => void;
}

const CreateDevice: FC<CreateDeviceProps> = ({ backToTable, refreshDevices }) => {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { accessToken } = useAuthState();
    const devicesDispatch = useDevicesDispatch();

    const onSubmit = (values: any, actions: any) => {
        const groupId = values.groupId;
        const url = `https://${domainName}/admin_api/device/${groupId}`;
        const config = axiosAuth(accessToken);
        const deviceData = {
            name: values.name,
            description: values.description,
            longitude: values.longitude,
            latitude: values.latitude
        }
        setIsSubmitting(true);
        axios
            .post(url, deviceData, config)
            .then((response) => {
                const data = response.data;
                toast.success(data.message);
                const devicesOptionToShow = { devicesOptionToShow: DEVICES_OPTIONS.TABLE };
                setIsSubmitting(false);
                setDevicesOptionToShow(devicesDispatch, devicesOptionToShow);
                refreshDevices();
            })
            .catch((error) => {
                const errorMessage = error.response.data.message;
                toast.error(errorMessage);
                backToTable();
            })
    }


    const initialDeviceData = {
        groupId: "",
        name: "",
        description: "",
        longitude: 0,
        latitude: 0,
    }

    const validationSchema = Yup.object().shape({
        groupId: Yup.number().required('Required'),
        name: Yup.string().max(190,"The maximum number of characters allowed is 190").required('Required'),
        description: Yup.string().required('Required'),
        longitude: Yup.number().min(-180, "The minimum value of longitude is -180").min(180, "The maximum value of longitude is 180").required('Required'),
        latitude: Yup.number().min(-90, "The minimum value of latitude is -90").min(90, "The maximum value of latitude is 90").required('Required'),
    });

    const onCancel = (e: SyntheticEvent) => {
        e.preventDefault();
        backToTable();
    };

    return (
        <>
            <FormTitle isSubmitting={isSubmitting}>Create device</FormTitle>
            <FormContainer>
                <Formik initialValues={initialDeviceData} validationSchema={validationSchema} onSubmit={onSubmit} >
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
                                        label='Device name'
                                        name='name'
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
                                        label='Longitude'
                                        name='longitude'
                                        type='text'
                                    />
                                    <FormikControl
                                        control='input'
                                        label='Latitude'
                                        name='latitude'
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

export default CreateDevice;