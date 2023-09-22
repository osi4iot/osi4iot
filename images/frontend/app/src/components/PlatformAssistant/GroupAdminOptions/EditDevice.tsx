import { FC, useState, SyntheticEvent, useEffect } from 'react';
import styled from "styled-components";
import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import { axiosAuth, getDomainName, getProtocol } from "../../../tools/tools";
import { useAuthDispatch, useAuthState } from "../../../contexts/authContext";
import { toast } from "react-toastify";
import FormikControl from "../../Tools/FormikControl";
import FormButtonsProps from "../../Tools/FormButtons";
import FormTitle from "../../Tools/FormTitle";
import { useDevicesDispatch, useDeviceIdToEdit, useDeviceRowIndexToEdit, setDevicesOptionToShow, useDeviceInputData } from '../../../contexts/devicesOptions';
import { DEVICES_OPTIONS, DEVICES_PREVIOUS_OPTIONS } from '../Utils/platformAssistantOptions';
import { IDevice } from '../TableColumns/devicesColumns';
import { IDeviceInputData } from '../../../contexts/devicesOptions/interfaces';
import {
    setDeviceBuildingId,
    setDeviceGroupId,
    setDeviceInputData,
    setDevicesPreviousOption
} from '../../../contexts/devicesOptions/devicesAction';
import { IOrgOfGroupsManaged } from '../TableColumns/orgsOfGroupsManagedColumns';
import { getAxiosInstance } from '../../../tools/axiosIntance';
import axiosErrorHandler from '../../../tools/axiosErrorHandler';


const FormContainer = styled.div`
	font-size: 12px;
    padding: 30px 20px;
    border: 3px solid #3274d9;
    border-radius: 20px;
    width: 400px;
    height: calc(100vh - 350px);

    form > div:nth-child(2) {
        margin-right: 10px;
    }
`;

const ControlsContainer = styled.div`
    height: calc(100vh - 480px);
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

const DeviceLocationTitle = styled.div`
    margin-bottom: 5px;
`;

const DeviceLocationContainer = styled.div`
    border: 2px solid #2c3235;
    border-radius: 10px;
    padding: 10px;
    width: 100%;
    margin-bottom: 15px;
`;

const SelectDeviceLocationButtonContainer = styled.div`
    display: flex;
    margin: 10px 0 10px;
    flex-direction: row;
    justify-content: center;
	align-items: center;
    background-color: #202226;
    width: 100%;
`;

const SelectLocationButton = styled.button`
	background-color: #3274d9;
	padding: 5px 10px;
    margin: 5px 10px;
	color: white;
	border: 1px solid #2c3235;
	border-radius: 10px;
	outline: none;
	cursor: pointer;
	box-shadow: 0 5px #173b70;
    font-size: 14px;
    width: 60%;

	&:hover {
		background-color: #2461c0;
	}

	&:active {
		background-color: #2461c0;
		box-shadow: 0 2px #173b70;
		transform: translateY(4px);
	}
`;


const deviceTypeOptions = [
    {
        label: "Generic",
        value: "Generic"
    },
    {
        label: "Master",
        value: "Master"
    }
];


const deviceInitInputFormData = {
    groupId: 0,
    deviceUid: "",
    type: "Generic",
    iconRadio: 1.0,
    longitude: 0,
    latitude: 0,
    mqttAccessControl: "Pub & Sub"
}

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

interface EditDeviceProps {
    orgsOfGroupManaged: IOrgOfGroupsManaged[];
    devices: IDevice[];
    backToTable: () => void;
    selectLocationOption: () => void;
    refreshDevices: () => void;
}

const EditDevice: FC<EditDeviceProps> = ({
    orgsOfGroupManaged,
    devices,
    backToTable,
    selectLocationOption,
    refreshDevices
}) => {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();
    const devicesDispatch = useDevicesDispatch();
    const deviceId = useDeviceIdToEdit();
    const deviceRowIndex = useDeviceRowIndexToEdit();
    const initialDeviceData = useDeviceInputData();

    useEffect(() => {
        const devicesPreviousOption = { devicesPreviousOption: DEVICES_PREVIOUS_OPTIONS.EDIT_DEVICE };
        setDevicesPreviousOption(devicesDispatch, devicesPreviousOption)
    }, [devicesDispatch])

    const onSubmit = (values: any, actions: any) => {
        const groupId = devices[deviceRowIndex].groupId;
        const url = `${protocol}://${domainName}/admin_api/device/${groupId}/id/${deviceId}`;
        const config = axiosAuth(accessToken);
        setIsSubmitting(true);

        if (typeof (values as any).longitude === 'string') {
            (values as any).longitude = parseFloat((values as any).longitude);
        }
        if (typeof (values as any).latitude === 'string') {
            (values as any).latitude = parseFloat((values as any).latitude);
        }

        if (typeof (values as any).iconRadio === 'string') {
            (values as any).iconRadio = parseFloat((values as any).iconRadio);
        }

        const deviceEditData = {
            iconRadio: values.iconRadio,
            longitude: values.longitude,
            latitude: values.latitude,
            mqttAccessControl: values.mqttAccessControl
        }

        const deviceInputFormData = { deviceInputFormData: deviceInitInputFormData };
        setDeviceInputData(devicesDispatch, deviceInputFormData);

        getAxiosInstance(refreshToken, authDispatch)
            .patch(url, deviceEditData, config)
            .then((response) => {
                const data = response.data;
                toast.success(data.message);
                const devicesOptionToShow = { devicesOptionToShow: DEVICES_OPTIONS.TABLE };
                setIsSubmitting(false);
                setDevicesOptionToShow(devicesDispatch, devicesOptionToShow);
                refreshDevices();
            })
            .catch((error) => {
                axiosErrorHandler(error, authDispatch);
                backToTable();
            })
    }

    const validationSchema = Yup.object().shape({
        type: Yup.string().required('Required'),
        longitude: Yup.number().moreThan(-180, "The minimum value of longitude is -180").lessThan(180, "The maximum value of longitude is 180").required('Required'),
        latitude: Yup.number().moreThan(-90, "The minimum value of latitude is -90").lessThan(90, "The maximum value of latitude is 90").required('Required'),
        iconRadio: Yup.number().min(0.2, "The minimum value of the icon ratio is 0.2m").max(2, "The maximum value of the icon ratio is 2m").required('Required'),
    });

    const onCancel = (e: SyntheticEvent) => {
        e.preventDefault();
        const deviceInputFormData = { deviceInputFormData: deviceInitInputFormData };
        setDeviceInputData(devicesDispatch, deviceInputFormData);
        backToTable();
    };

    const selectLocation = (deviceInputData: IDeviceInputData) => {
        deviceInputData.iconRadio = parseFloat(deviceInputData.iconRadio as unknown as string);
        const orgId = devices[deviceRowIndex].orgId;
        const deviceInputFormData = { deviceInputFormData: deviceInputData };
        setDeviceInputData(devicesDispatch, deviceInputFormData);
        const buildingId = orgsOfGroupManaged.filter(org => org.id === orgId)[0].buildingId;
        const deviceBuildingId = { deviceBuildingId: buildingId };
        setDeviceBuildingId(devicesDispatch, deviceBuildingId);
        const groupId = devices[deviceRowIndex].groupId;
        const deviceGroupId = { deviceGroupId: groupId };
        setDeviceGroupId(devicesDispatch, deviceGroupId);
        selectLocationOption();
    }

    return (
        <>
            <FormTitle isSubmitting={isSubmitting} >Edit device</FormTitle>
            <FormContainer>
                <Formik initialValues={initialDeviceData} validationSchema={validationSchema} onSubmit={onSubmit} >
                    {
                        formik => (
                            <Form>
                                <ControlsContainer>
                                    <FormikControl
                                        control='select'
                                        label='Type'
                                        name="type"
                                        options={deviceTypeOptions}
                                        type='text'
                                    />
                                    <FormikControl
                                        control='select'
                                        label='Mqtt access control'
                                        name="mqttAccessControl"
                                        options={mqttAccessControlOptions}
                                        type='text'
                                    />
                                    <DeviceLocationTitle>Device location and icon size</DeviceLocationTitle>
                                    <DeviceLocationContainer>
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
                                        <FormikControl
                                            control='input'
                                            label='Icon radio (m)'
                                            name='iconRadio'
                                            type='text'
                                        />
                                        <SelectDeviceLocationButtonContainer >
                                            <SelectLocationButton type='button' onClick={() => selectLocation(formik.values)}>
                                                Select location
                                            </SelectLocationButton>
                                        </SelectDeviceLocationButtonContainer>
                                    </DeviceLocationContainer>
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

export default EditDevice;