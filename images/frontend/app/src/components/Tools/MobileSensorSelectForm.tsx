import { FC, useState, SyntheticEvent, useEffect } from 'react';
import styled from "styled-components";
import { useHistory } from "react-router-dom";
import { Formik, Form, FormikProps } from 'formik';
import FormikControl from "./FormikControl";
import MobileSensorSelectFormButtons from "./MobileSensorSelectFormButtons";
import { IMobileTopic } from '../PlatformAssistant/TableColumns/topicsColumns';
import { InitialMobileSensorData } from '../../pages/MobileSensorsPage';

const Title = styled.h2`
	font-size: 20px;
	margin-top: 30px;
	margin-bottom: 0px;
	font-weight: 400;
	text-align: center;
	color: white;
	width: 300px;
`;

interface ConnectionLedProps {
    readonly isMqttConnected: boolean;
}

const ConnectionLed = styled.span<ConnectionLedProps>`
	background-color: ${(props) => (props.isMqttConnected ? "#62f700" : "#f80000")};
	width: 17px;
	height: 17px;
	margin: -2px 10px;
	border-radius: 50%;
	border: 2px solid #ffffff;
	display: inline-block;
`;

const FormContainer = styled.div`
	font-size: 12px;
    height: calc(100vh - 160px);
	position: relative;
	margin: 0 5px;
	color: white;
	margin: 10px 0;
	padding: 10px;
	width: calc(100vw - 40px);
	max-width: 400px;
	border: 2px solid #3274d9;
	border-radius: 15px;

    form > div:nth-child(2) {
        margin-right: 10px;
    }
`;

const ControlsContainer = styled.div`
    height: calc(100vh - 245px);
    width: 100%;
    padding: 10px 5px;
    margin-bottom: 15px;
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

interface IOption {
    value: string;
    label: string;
}


type FormikType = FormikProps<InitialMobileSensorData>

interface MobileSensorSelectFormProps {
    isMqttConnected: boolean;
    handleMobileSensorSelection: (values: any, actions: any) => void
    mobileTopicsManaged: IMobileTopic[];
    initialMobileSensorData: InitialMobileSensorData;
    setInitialMobileSensorData: React.Dispatch<React.SetStateAction<InitialMobileSensorData | null>>;
    setMobileTopicSelected: React.Dispatch<React.SetStateAction<IMobileTopic | null>>;
}

const mobileSensorOptions = [
    {
        label: "Accelerations",
        value: "accelerations"
    },
    {
        label: "Mobile orientation",
        value: "mobile_orientation"
    },    
    {
        label: "Photo",
        value: "photo"
    }
];

const convertArrayToOptions = (vector: string[]): IOption[] => {
    const options: IOption[] = [];
    for (const elem of vector) {
        const option: IOption = {
            label: elem,
            value: elem
        }
        options.push(option);
    }
    return options;
}

const findOrgArray = (mobileTopicsManaged: IMobileTopic[]): string[] => {
    const orgArray: string[] = []
    for (const mobileTopic of mobileTopicsManaged) {
        if (orgArray.indexOf(mobileTopic.orgAcronym) === -1) {
            orgArray.push(mobileTopic.orgAcronym);
        }
    }
    return orgArray;
}

const findGroupArray = (mobileTopicsManaged: IMobileTopic[]): Record<string, string[]> => {
    const groupArray: Record<string, string[]> = {}
    for (const mobileTopic of mobileTopicsManaged) {
        if (groupArray[mobileTopic.orgAcronym] === undefined) {
            groupArray[mobileTopic.orgAcronym] = [];
        }
        if (groupArray[mobileTopic.orgAcronym].indexOf(mobileTopic.groupAcronym) === -1) {
            groupArray[mobileTopic.orgAcronym].push(mobileTopic.groupAcronym);
        }
    }
    return groupArray;
}

const findDeviceArray = (mobileTopicsManaged: IMobileTopic[]): Record<string, string[]> => {
    const deviceArray: Record<string, string[]> = {}
    for (const mobileTopic of mobileTopicsManaged) {
        if (deviceArray[mobileTopic.groupAcronym] === undefined) {
            deviceArray[mobileTopic.groupAcronym] = [];
        }
        if (deviceArray[mobileTopic.groupAcronym].indexOf(mobileTopic.deviceName) === -1) {
            deviceArray[mobileTopic.groupAcronym].push(mobileTopic.deviceName);
        }
    }
    return deviceArray;
}

const findTopicArrayForMobileSensors = (mobileSensors: string[], mobileTopicsManaged: IMobileTopic[]): Record<string, string[]> => {
    const topicArray: Record<string, string[]> = {}
    for (const mobileTopic of mobileTopicsManaged) {
        let areThereAllMobileSensorsFields = true;
        for (const sensorField of mobileSensors) {
            if (mobileTopic.payloadFormat[sensorField] === undefined) {
                areThereAllMobileSensorsFields = false;
                break;
            }
        }
        if (areThereAllMobileSensorsFields) {
            if (topicArray[mobileTopic.deviceName] === undefined) {
                topicArray[mobileTopic.deviceName] = [];
            }
            if (topicArray[mobileTopic.deviceName].indexOf(mobileTopic.topicName) === -1) {
                topicArray[mobileTopic.deviceName].push(mobileTopic.topicName);
            }
        }
    }
    return topicArray;
}


const findMobileTopicSelected = (
    mobileTopicsManaged: IMobileTopic[],
    orgAcronym: string,
    groupAcronym: string,
    deviceName: string,
    mobileSensor: string,
    topicName: string,
): IMobileTopic => {
    const mobileTopicSelected = mobileTopicsManaged.filter(mobileTopic => {
        let mobileSensorType = "none";
        if (mobileTopic.payloadFormat["mobile_photo"] !== undefined) {
            mobileSensorType = "photo";
        } else if (mobileTopic.payloadFormat["mobile_accelerations"] !== undefined) {
            mobileSensorType = "accelerations";
        } else if (mobileTopic.payloadFormat["mobile_quaternion"] !== undefined) {
            mobileSensorType = "mobile_orientation";
        }

        if (mobileTopic.orgAcronym === orgAcronym &&
            mobileTopic.groupAcronym === groupAcronym &&
            mobileTopic.deviceName === deviceName &&
            mobileSensorType === mobileSensor &&
            mobileTopic.topicName === topicName) {
            return true
        } else return false
    })[0];
    return mobileTopicSelected;
}

const MobileSensorSelectForm: FC<MobileSensorSelectFormProps> = (
    {
        isMqttConnected,
        handleMobileSensorSelection,
        mobileTopicsManaged,
        initialMobileSensorData,
        setInitialMobileSensorData,
        setMobileTopicSelected
    }) => {
    const history = useHistory();
    const [orgOptions, setOrgOptions] = useState<IOption[]>([]);
    const [groupArray, setGroupArray] = useState<Record<string, string[]>>({});
    const [groupOptions, setGroupOptions] = useState<IOption[]>([]);
    const [deviceOptions, setDeviceOptions] = useState<IOption[]>([]);
    const [deviceArray, setDeviceArray] = useState<Record<string, string[]>>({});
    const [topicAccelerationArray, setTopicAccelerationArray] = useState<Record<string, string[]>>({});
    const [topicMobileOrientationArray, setTopicMobileOrientationArray] = useState<Record<string, string[]>>({});
    const [topicPhotoArray, setTopicPhotoArray] = useState<Record<string, string[]>>({});
    const [topicOptions, seTopicOptions] = useState<IOption[]>([]);

    useEffect(() => {
        if (mobileTopicsManaged.length !== 0) {
            const orgArray = findOrgArray(mobileTopicsManaged);
            setOrgOptions(convertArrayToOptions(orgArray));
            const groupArray = findGroupArray(mobileTopicsManaged);
            setGroupArray(groupArray);
            const orgAcronym = initialMobileSensorData.orgAcronym;
            const groupsForOrgSelected = groupArray[orgAcronym];
            setGroupOptions(convertArrayToOptions(groupsForOrgSelected));
            const deviceArray = findDeviceArray(mobileTopicsManaged);
            setDeviceArray(deviceArray);
            const groupAcronym = initialMobileSensorData.groupAcronym
            const devicesForGroupSelected = deviceArray[groupAcronym];
            setDeviceOptions(convertArrayToOptions(devicesForGroupSelected));
            const deviceName = initialMobileSensorData.deviceName;
            const topicAccelerationArray = findTopicArrayForMobileSensors(["mobile_accelerations"], mobileTopicsManaged);
            setTopicAccelerationArray(topicAccelerationArray);
            const topicMobileOrientationArray = findTopicArrayForMobileSensors(["mobile_quaternion"], mobileTopicsManaged);
            setTopicMobileOrientationArray(topicMobileOrientationArray);
            const topicPhotoArray = findTopicArrayForMobileSensors(["mobile_photo"], mobileTopicsManaged);
            setTopicPhotoArray(topicPhotoArray);
            if (initialMobileSensorData.mobileSensor === "accelerations") {
                const topicsAccelerationForDeviceSelected = topicAccelerationArray[deviceName];
                const topicAccelerationOptions = convertArrayToOptions(topicsAccelerationForDeviceSelected);
                seTopicOptions(topicAccelerationOptions);
            } else if (initialMobileSensorData.mobileSensor === "mobile_orientation") {
                const topicsMobileOrientationForDeviceSelected = topicMobileOrientationArray[deviceName];
                const topicMobileOrientationOptions = convertArrayToOptions(topicsMobileOrientationForDeviceSelected);
                seTopicOptions(topicMobileOrientationOptions);
            } else if (initialMobileSensorData.mobileSensor === "photo") {
                const topicsPhotoForDeviceSelected = topicPhotoArray[deviceName];
                const topicPhotoOptions = convertArrayToOptions(topicsPhotoForDeviceSelected);
                seTopicOptions(topicPhotoOptions);
            }

        }
    }, [mobileTopicsManaged, initialMobileSensorData]);


    const onCancel = (e: SyntheticEvent) => {
        e.preventDefault();
        history.push("/");
    };

    const handleChangeOrg = (e: { value: string }, formik: FormikType) => {
        const orgAcronym = e.value;
        formik.setFieldValue("orgAcronym", orgAcronym);
        const groupsForOrgSelected = groupArray[orgAcronym];
        setGroupOptions(convertArrayToOptions(groupsForOrgSelected));
        const groupAcronym = groupsForOrgSelected[0];
        formik.setFieldValue("groupAcronym", groupsForOrgSelected[0]);
        const devicesForGroupSelected = deviceArray[groupAcronym];
        setDeviceOptions(convertArrayToOptions(devicesForGroupSelected));
        const deviceName = devicesForGroupSelected[0];
        formik.setFieldValue("deviceName", deviceName);
        const mobileSensor = formik.values.mobileSensor;
        let topicName = "";
        if (mobileSensor === "accelerations") {
            const topicsAccelerationForDeviceSelected = topicAccelerationArray[devicesForGroupSelected[0]];
            const topicAccelerationOptions = convertArrayToOptions(topicsAccelerationForDeviceSelected);
            seTopicOptions(topicAccelerationOptions);
            topicName = topicsAccelerationForDeviceSelected[0]
            formik.setFieldValue("topicName", topicName);
        } else if (mobileSensor === "mobile_orientation") {
            const topicsMobileOrientationForDeviceSelected = topicMobileOrientationArray[devicesForGroupSelected[0]];
            const topicMobileOrientationOptions = convertArrayToOptions(topicsMobileOrientationForDeviceSelected);
            seTopicOptions(topicMobileOrientationOptions);
            topicName = topicsMobileOrientationForDeviceSelected[0];
            formik.setFieldValue("topicName", topicName);
        } else if (mobileSensor === "photo") {
            const topicsPhotoForDeviceSelected = topicPhotoArray[devicesForGroupSelected[0]];
            const topicPhotoOptions = convertArrayToOptions(topicsPhotoForDeviceSelected);
            seTopicOptions(topicPhotoOptions);
            topicName = topicsPhotoForDeviceSelected[0];
            formik.setFieldValue("topicName", topicName);
        }
        const mobileTopicSelected = findMobileTopicSelected(
            mobileTopicsManaged,
            orgAcronym,
            groupAcronym,
            deviceName,
            mobileSensor,
            topicName
        );
        setMobileTopicSelected(mobileTopicSelected);
    }

    const handleChangeGroup = (e: { value: string }, formik: FormikType) => {
        const orgAcronym = formik.values.orgAcronym;
        const groupAcronym = e.value;
        formik.setFieldValue("groupAcronym", groupAcronym);
        const devicesForGroupSelected = deviceArray[groupAcronym];
        setDeviceOptions(convertArrayToOptions(devicesForGroupSelected));
        const deviceName = devicesForGroupSelected[0];
        formik.setFieldValue("deviceName", deviceName);
        const mobileSensor = formik.values.mobileSensor;
        let topicName = "";
        if (mobileSensor === "accelerations") {
            const topicsAccelerationForDeviceSelected = topicAccelerationArray[devicesForGroupSelected[0]];
            const topicAccelerationOptions = convertArrayToOptions(topicsAccelerationForDeviceSelected);
            seTopicOptions(topicAccelerationOptions);
            topicName = topicsAccelerationForDeviceSelected[0];
            formik.setFieldValue("topicName", topicName);
        } else if (mobileSensor === "mobile_orientation") {
            const topicsMobileOrientationForDeviceSelected = topicMobileOrientationArray[devicesForGroupSelected[0]];
            const topicMobileOrientationOptions = convertArrayToOptions(topicsMobileOrientationForDeviceSelected);
            seTopicOptions(topicMobileOrientationOptions);
            topicName = topicsMobileOrientationForDeviceSelected[0];
            formik.setFieldValue("topicName", topicName);
        } else if (mobileSensor === "photo") {
            const topicsPhotoForDeviceSelected = topicPhotoArray[devicesForGroupSelected[0]];
            const topicPhotoOptions = convertArrayToOptions(topicsPhotoForDeviceSelected);
            seTopicOptions(topicPhotoOptions);
            topicName = topicsPhotoForDeviceSelected[0];
            formik.setFieldValue("topicName", topicName);
        }
        const mobileTopicSelected = findMobileTopicSelected(
            mobileTopicsManaged,
            orgAcronym,
            groupAcronym,
            deviceName,
            mobileSensor,
            topicName
        );
        setMobileTopicSelected(mobileTopicSelected);
    }

    const handleChangeDevice = (e: { value: string }, formik: FormikType) => {
        const orgAcronym = formik.values.orgAcronym;
        const groupAcronym = formik.values.groupAcronym;
        const deviceName = e.value;
        formik.setFieldValue("deviceName", deviceName);
        const mobileSensor = formik.values.mobileSensor;
        let topicName = "";
        if (mobileSensor === "accelerations") {
            const topicsAccelerationForDeviceSelected = topicAccelerationArray[deviceName];
            const topicAccelerationOptions = convertArrayToOptions(topicsAccelerationForDeviceSelected);
            seTopicOptions(topicAccelerationOptions);
            topicName = topicsAccelerationForDeviceSelected[0];
            formik.setFieldValue("topicName", topicName);
        } else if (mobileSensor === "mobile_orientation") {
            const topicsMobileOrientationForDeviceSelected = topicMobileOrientationArray[deviceName];
            const topicMobileOrientationOptions = convertArrayToOptions(topicsMobileOrientationForDeviceSelected);
            seTopicOptions(topicMobileOrientationOptions);
            topicName = topicsMobileOrientationForDeviceSelected[0];
            formik.setFieldValue("topicName", topicName);
        } else if (mobileSensor === "photo") {
            const topicsPhotoForDeviceSelected = topicPhotoArray[deviceName];
            const topicPhotoOptions = convertArrayToOptions(topicsPhotoForDeviceSelected);
            seTopicOptions(topicPhotoOptions);
            topicName = topicsPhotoForDeviceSelected[0];
            formik.setFieldValue("topicName", topicName);
        }
        const mobileTopicSelected = findMobileTopicSelected(
            mobileTopicsManaged,
            orgAcronym,
            groupAcronym,
            deviceName,
            mobileSensor,
            topicName
        );
        setMobileTopicSelected(mobileTopicSelected);
    }

    const handleChangeMobileSensor = (e: { value: string }, formik: FormikType) => {
        const mobileSensor = e.value;
        formik.setFieldValue("mobileSensor", mobileSensor);
        const orgAcronym = formik.values.orgAcronym;
        const groupAcronym = formik.values.groupAcronym;
        const deviceName = formik.values.deviceName;
        let topicName = "";
        if (mobileSensor === "accelerations") {
            const topicsAccelerationForDeviceSelected = topicAccelerationArray[deviceName];
            const topicAccelerationOptions = convertArrayToOptions(topicsAccelerationForDeviceSelected);
            seTopicOptions(topicAccelerationOptions);
            topicName = topicAccelerationArray[deviceName][0];
        } else if (mobileSensor === "mobile_orientation") {
            const topicsMobileOrientationForDeviceSelected = topicMobileOrientationArray[deviceName];
            const topicMobileOrientationOptions = convertArrayToOptions(topicsMobileOrientationForDeviceSelected);
            seTopicOptions(topicMobileOrientationOptions);
            topicName = topicMobileOrientationArray[deviceName][0];
        } else if (mobileSensor === "photo") {
            const topicsPhotoForDeviceSelected = topicPhotoArray[deviceName];
            const topicPhotoOptions = convertArrayToOptions(topicsPhotoForDeviceSelected);
            seTopicOptions(topicPhotoOptions);
            topicName = topicPhotoArray[deviceName][0];
        }
        formik.setFieldValue("topicName", topicName);

        const mobileTopicSelected = findMobileTopicSelected(
            mobileTopicsManaged,
            orgAcronym,
            groupAcronym,
            deviceName,
            mobileSensor,
            topicName
        );
        setMobileTopicSelected(mobileTopicSelected);
        setInitialMobileSensorData({ orgAcronym, groupAcronym, deviceName, mobileSensor, topicName });
    }

    const handleChangeTopic = (e: { value: string }, formik: FormikType) => {
        const topicName = e.value;
        formik.setFieldValue("topicName", topicName);
        const orgAcronym = formik.values.orgAcronym;
        const groupAcronym = formik.values.groupAcronym;
        const deviceName = formik.values.deviceName;
        const mobileSensor = formik.values.mobileSensor;
        const mobileTopicSelected = findMobileTopicSelected(
            mobileTopicsManaged,
            orgAcronym,
            groupAcronym,
            deviceName,
            mobileSensor,
            topicName
        );
        setMobileTopicSelected(mobileTopicSelected);
    }

    return (
        <>
            <Title>
                Mobile sensors <ConnectionLed isMqttConnected={isMqttConnected} />
            </Title>
            <FormContainer>
                <Formik initialValues={initialMobileSensorData as InitialMobileSensorData} onSubmit={handleMobileSensorSelection} >
                    {
                        formik => (
                            <Form>
                                <ControlsContainer>
                                    <FormikControl
                                        control='select'
                                        label='Select org'
                                        name='orgAcronym'
                                        type='text'
                                        options={orgOptions}
                                        onChange={(e) => handleChangeOrg(e, formik)}
                                    />
                                    <FormikControl
                                        control='select'
                                        label='Select group'
                                        name='groupAcronym'
                                        type='text'
                                        options={groupOptions}
                                        onChange={(e) => handleChangeGroup(e, formik)}
                                    />
                                    <FormikControl
                                        control='select'
                                        label='Select device'
                                        name='deviceName'
                                        type='text'
                                        options={deviceOptions}
                                        onChange={(e) => handleChangeDevice(e, formik)}
                                    />
                                    <FormikControl
                                        control='select'
                                        label='Select mobile sensor'
                                        name='mobileSensor'
                                        type='text'
                                        options={mobileSensorOptions}
                                        onChange={(e) => handleChangeMobileSensor(e, formik)}
                                    />
                                    <FormikControl
                                        control='select'
                                        label='Topic name'
                                        name='topicName'
                                        type='text'
                                        options={topicOptions}
                                        onChange={(e) => handleChangeTopic(e, formik)}
                                    />
                                </ControlsContainer>
                                <MobileSensorSelectFormButtons onCancel={onCancel} isValid={formik.isValid} isSubmitting={formik.isSubmitting} />
                            </Form>
                        )
                    }
                </Formik>
            </FormContainer>
        </>
    )
}

export default MobileSensorSelectForm;
