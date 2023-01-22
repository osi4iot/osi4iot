import { FC, useState, SyntheticEvent, useEffect } from 'react';
import styled from "styled-components";
import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import { useAuthState, useAuthDispatch } from '../../../contexts/authContext';
import { axiosAuth, getDomainName, getProtocol } from "../../../tools/tools";
import { toast } from "react-toastify";
import FormikControl from "../../Tools/FormikControl";
import FormButtonsProps from "../../Tools/FormButtons";
import FormTitle from "../../Tools/FormTitle";
import { useDevicesDispatch, setDevicesOptionToShow, setDevicesPreviousOption, useDeviceInputData } from '../../../contexts/devicesOptions';
import { DEVICES_OPTIONS, DEVICES_PREVIOUS_OPTIONS } from '../Utils/platformAssistantOptions';
import { IDeviceInputData } from '../../../contexts/devicesOptions/interfaces';
import { setDeviceBuildingId, setDeviceGroupId, setDeviceInputData } from '../../../contexts/devicesOptions/devicesAction';
import { IOrgOfGroupsManaged } from '../TableColumns/orgsOfGroupsManagedColumns';
import { IGroupManaged } from '../TableColumns/groupsManagedColumns';
import axiosErrorHandler from '../../../tools/axiosErrorHandler';
import { getAxiosInstance } from '../../../tools/axiosIntance';


const FormContainer = styled.div`
	font-size: 12px;
    padding: 30px 20px;
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

const DeviceLocationTitle = styled.div`
    margin-bottom: 5px;
`;

const DeviceLocationContainerDiv = styled.div`
    border: 2px solid #2c3235;
    border-radius: 10px;
    padding: 10px;
    width: 100%;
    margin-bottom: 15px;
`;

const SelectDeviceLocationDivButtonContainer = styled.div`
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

interface CreateDeviceProps {
    backToTable: () => void;
    refreshDevices: () => void;
    orgsOfGroupManaged: IOrgOfGroupsManaged[];
    groupsManaged: IGroupManaged[];
    selectLocationOption: () => void;
}

const CreateDevice: FC<CreateDeviceProps> = ({
    backToTable,
    refreshDevices,
    orgsOfGroupManaged,
    groupsManaged,
    selectLocationOption
}) => {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();
    const devicesDispatch = useDevicesDispatch();
    const initialDeviceData = useDeviceInputData();

    useEffect(() => {
        const devicesPreviousOption = { devicesPreviousOption: DEVICES_PREVIOUS_OPTIONS.CREATE_DEVICE };
        setDevicesPreviousOption(devicesDispatch, devicesPreviousOption)
    }, [devicesDispatch])

    const onSubmit = (values: any, actions: any) => {
        const groupId = values.groupId;
        const url = `${protocol}://${domainName}/admin_api/device/${groupId}`;
        const config = axiosAuth(accessToken);

        if (typeof (values as any).longitude === 'string') {
            (values as any).longitude = parseFloat((values as any).longitude);
        }

        if (typeof (values as any).latitude === 'string') {
            (values as any).latitude = parseFloat((values as any).latitude);
        }

        if (typeof (values as any).iconRadio === 'string') {
            (values as any).iconRadio = parseFloat((values as any).iconRadio);
        }

        const deviceData = {
            name: values.name,
            description: values.description,
            longitude: values.longitude,
            latitude: values.latitude,
            type: values.type,
            iconRadio: values.iconRadio,
            mqttAccessControl: values.mqttAccessControl
        }

        setIsSubmitting(true);
        getAxiosInstance(refreshToken, authDispatch)
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
                axiosErrorHandler(error, authDispatch);
                backToTable();
            })
    }

    const validationSchema = Yup.object().shape({
        groupId: Yup.number().required('Required'),
        name: Yup.string().max(190, "The maximum number of characters allowed is 190").required('Required'),
        description: Yup.string().max(190, "The maximum number of characters allowed is 190").required('Required'),
        type: Yup.string().required('Required'),
        longitude: Yup.number().moreThan(-180, "The minimum value of longitude is -180").lessThan(180, "The maximum value of longitude is 180").required('Required'),
        latitude: Yup.number().moreThan(-90, "The minimum value of latitude is -90").lessThan(90, "The maximum value of latitude is 90").required('Required'),
        iconRadio: Yup.number().min(0.2, "The minimum value of the icon ratio is 0.2m").max(2, "The maximum value of the icon ratio is 2m").required('Required'),
    });

    const onCancel = (e: SyntheticEvent) => {
        e.preventDefault();
        backToTable();
    };

    const selectLocation = (deviceInputData: IDeviceInputData) => {
        deviceInputData.iconRadio = parseFloat(deviceInputData.iconRadio as unknown as string);
        const groupId = parseInt(deviceInputData.groupId as string, 10);
        const group = groupsManaged.filter(group => group.id === groupId)[0];
        if (!group) {
            const warningMessage = "The groupId indicated not exists or not corresponds to a group managed by the user."
            toast.warning(warningMessage);
        } else {
            const deviceInputFormData = { deviceInputFormData: deviceInputData };
            setDeviceInputData(devicesDispatch, deviceInputFormData);
            const deviceGroupId = { deviceGroupId: groupId };
            setDeviceGroupId(devicesDispatch, deviceGroupId);
            const buildingId = orgsOfGroupManaged.filter(org => org.id === group.orgId)[0].buildingId;
            const deviceBuildingId = { deviceBuildingId: buildingId };
            setDeviceBuildingId(devicesDispatch, deviceBuildingId);
            selectLocationOption();
        }
    }

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
                                    <DeviceLocationContainerDiv>
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
                                            label='Icon ratio'
                                            name='iconRadio'
                                            type='text'
                                        />
                                        <SelectDeviceLocationDivButtonContainer >
                                            <SelectLocationButton type='button' onClick={() => selectLocation(formik.values)}>
                                                Select location
                                            </SelectLocationButton>
                                        </SelectDeviceLocationDivButtonContainer>
                                    </DeviceLocationContainerDiv>
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