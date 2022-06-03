import { FC, useState, SyntheticEvent, useEffect } from 'react';
import styled from "styled-components";
import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import { useAuthState, useAuthDispatch } from '../../../contexts/authContext';
import { axiosAuth, axiosInstance, getDomainName } from "../../../tools/tools";
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
import { setReloadMasterDevicesTable, usePlatformAssitantDispatch } from '../../../contexts/platformAssistantContext';


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

const domainName = getDomainName();

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
    const plaformAssistantDispatch = usePlatformAssitantDispatch();
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
        const url = `${domainName}/admin_api/device/${groupId}`;
        const config = axiosAuth(accessToken);

        if (typeof (values as any).longitude === 'string') {
            (values as any).longitude = parseFloat((values as any).longitude);
        }

        if (typeof (values as any).latitude === 'string') {
            (values as any).latitude = parseFloat((values as any).latitude);
        }

        const deviceData = {
            name: values.name,
            description: values.description,
            longitude: values.longitude,
            latitude: values.latitude,
            type: values.type
        }
        setIsSubmitting(true);
        axiosInstance(refreshToken, authDispatch)
            .post(url, deviceData, config)
            .then((response) => {
                const data = response.data;
                toast.success(data.message);
                const devicesOptionToShow = { devicesOptionToShow: DEVICES_OPTIONS.TABLE };
                setIsSubmitting(false);
                setDevicesOptionToShow(devicesDispatch, devicesOptionToShow);
                refreshDevices();

                if (values.type === "Master") {
                    const reloadMasterDevicesTable = true;
                    setReloadMasterDevicesTable(plaformAssistantDispatch, { reloadMasterDevicesTable });
                }
            })
            .catch((error) => {
                const errorMessage = error.response.data.message;
                toast.error(errorMessage);
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
    });

    const onCancel = (e: SyntheticEvent) => {
        e.preventDefault();
        backToTable();
    };

    const selectLocation = (deviceInputData: IDeviceInputData) => {
        const groupId = parseInt(deviceInputData.groupId as string, 10);
        const group = groupsManaged.filter(group => group.id === groupId)[0];
        if (!group) {
            const warningMessage = "The groupId indicated not exists or not corresponds to a group managed by the user."
            toast.warning(warningMessage);
        } else {
            const deviceInputFormData = {  deviceInputFormData: deviceInputData };
            setDeviceInputData(devicesDispatch, deviceInputFormData);
            const deviceGroupId = { deviceGroupId: groupId };
            setDeviceGroupId(devicesDispatch, deviceGroupId);
            const buildingId =  orgsOfGroupManaged.filter(org => org.id === group.orgId)[0].buildingId;
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
                                    <DeviceLocationTitle>Device location</DeviceLocationTitle>
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

export default CreateDevice;