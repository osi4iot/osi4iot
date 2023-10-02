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

const findAssetNameArray = (mobileTopicsManaged: IMobileTopic[]): Record<string, string[]> => {
    const assetArray: Record<string, string[]> = {}
    for (const mobileTopic of mobileTopicsManaged) {
        if (assetArray[mobileTopic.groupAcronym] === undefined) {
            assetArray[mobileTopic.groupAcronym] = [];
        }
        const assetName = `Asset_${mobileTopic.assetUid}`;
        if (assetArray[mobileTopic.groupAcronym].indexOf(assetName) === -1) {
            assetArray[mobileTopic.groupAcronym].push(assetName);
        }
    }
    return assetArray;
}

const findAssetDescription = (mobileTopicsManaged: IMobileTopic[], assetName: string): string => {
    const mobileTopic = mobileTopicsManaged.filter(topic => `Asset_${topic.assetUid}` === assetName)[0];
    return mobileTopic.assetDescription;
}

const findMobileSensorArray = (mobileTopicsManaged: IMobileTopic[]): Record<string, string[]> => {
    const mobileSensorArray: Record<string, string[]> = {}
    for (const mobileTopic of mobileTopicsManaged) {
        const assetName = `Asset_${mobileTopic.assetUid}`;
        if (mobileSensorArray[assetName] === undefined) {
            mobileSensorArray[assetName] = [];
        }
        if (mobileSensorArray[assetName].indexOf(mobileTopic.sensorDescription) === -1) {
            mobileSensorArray[assetName].push(mobileTopic.sensorDescription);
        }
    }
    return mobileSensorArray;
}

const findMobileTopicSelected = (
    mobileTopicsManaged: IMobileTopic[],
    orgAcronym: string,
    groupAcronym: string,
    assetName: string,
    mobileSensor: string,
): IMobileTopic => {
    const mobileTopicSelected = mobileTopicsManaged.filter(mobileTopic =>
        mobileTopic.orgAcronym === orgAcronym &&
        mobileTopic.groupAcronym === groupAcronym &&
        `Asset_${mobileTopic.assetUid}` === assetName &&
        mobileTopic.sensorDescription === mobileSensor
    )[0];
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
    const [assetNameOptions, setAssetNameOptions] = useState<IOption[]>([]);
    const [assetNameArray, setAssetNameArray] = useState<Record<string, string[]>>({});
    const [assetDescription, setAssetDescription] = useState<string>(initialMobileSensorData.assetDescription);
    const [mobileSensorArray, setMobileSensorAarray] = useState<Record<string, string[]>>({});
    const [mobileSensorOptions, setMobileSensorOptions] = useState<IOption[]>([]);


    useEffect(() => {
        if (mobileTopicsManaged.length !== 0) {
            const orgArray = findOrgArray(mobileTopicsManaged);
            setOrgOptions(convertArrayToOptions(orgArray));
            const groupArray = findGroupArray(mobileTopicsManaged);
            setGroupArray(groupArray);
            const orgAcronym = initialMobileSensorData.orgAcronym;
            const groupsForOrgSelected = groupArray[orgAcronym];
            setGroupOptions(convertArrayToOptions(groupsForOrgSelected));
            const assetNameArray = findAssetNameArray(mobileTopicsManaged);
            setAssetNameArray(assetNameArray);
            const groupAcronym = initialMobileSensorData.groupAcronym
            const assetsForGroupSelected = assetNameArray[groupAcronym];
            setAssetNameOptions(convertArrayToOptions(assetsForGroupSelected));
            const assetName = initialMobileSensorData.assetName;
            const assetDescription = findAssetDescription(mobileTopicsManaged, assetName);
            setAssetDescription(assetDescription);
            const mobileSensorArray = findMobileSensorArray(mobileTopicsManaged);
            setMobileSensorAarray(mobileSensorArray);
            const mobileSensorsForAssetSelected = mobileSensorArray[assetName];
            setMobileSensorOptions(convertArrayToOptions(mobileSensorsForAssetSelected));
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
        const assetsForGroupSelected = assetNameArray[groupAcronym];
        setAssetNameOptions(convertArrayToOptions(assetsForGroupSelected));
        const assetName = assetsForGroupSelected[0];
        formik.setFieldValue("assetName", assetName);
        const assetDescription = findAssetDescription(mobileTopicsManaged, assetName);
        setAssetDescription(assetDescription);
        const mobileSensorsForAssetSelected = mobileSensorArray[assetName];
        const mobileSensor = mobileSensorsForAssetSelected[0];
        formik.setFieldValue("mobileSensor", mobileSensor);
        const mobileTopicSelected = findMobileTopicSelected(
            mobileTopicsManaged,
            orgAcronym,
            groupAcronym,
            assetName,
            mobileSensor
        );
        setMobileTopicSelected(mobileTopicSelected);
    }

    const handleChangeGroup = (e: { value: string }, formik: FormikType) => {
        const orgAcronym = formik.values.orgAcronym;
        const groupAcronym = e.value;
        formik.setFieldValue("groupAcronym", groupAcronym);
        const assetsForGroupSelected = assetNameArray[groupAcronym];
        setAssetNameOptions(convertArrayToOptions(assetsForGroupSelected));
        const assetName = assetsForGroupSelected[0];
        formik.setFieldValue("assetName", assetName);
        const assetDescription = findAssetDescription(mobileTopicsManaged, assetName);
        setAssetDescription(assetDescription);
        const mobileSensorsForAssetSelected = mobileSensorArray[assetName];
        const mobileSensor = mobileSensorsForAssetSelected[0];
        formik.setFieldValue("mobileSensor", mobileSensor);
        const mobileTopicSelected = findMobileTopicSelected(
            mobileTopicsManaged,
            orgAcronym,
            groupAcronym,
            assetName,
            mobileSensor
        );
        setMobileTopicSelected(mobileTopicSelected);
    }

    const handleChangeAsset = (e: { value: string }, formik: FormikType) => {
        const orgAcronym = formik.values.orgAcronym;
        const groupAcronym = formik.values.groupAcronym;
        const assetName = e.value;
        formik.setFieldValue("assetName", assetName);
        const assetDescription = findAssetDescription(mobileTopicsManaged, assetName);
        setAssetDescription(assetDescription);
        const mobileSensorsForAssetSelected = mobileSensorArray[assetName];
        const mobileSensor = mobileSensorsForAssetSelected[0];
        formik.setFieldValue("mobileSensor", mobileSensor);
        const mobileTopicSelected = findMobileTopicSelected(
            mobileTopicsManaged,
            orgAcronym,
            groupAcronym,
            assetName,
            mobileSensor
        );
        setMobileTopicSelected(mobileTopicSelected);
    }

    const handleChangeMobileSensor = (e: { value: string }, formik: FormikType) => {
        const mobileSensor = e.value;
        formik.setFieldValue("mobileSensor", mobileSensor);
        const orgAcronym = formik.values.orgAcronym;
        const groupAcronym = formik.values.groupAcronym;
        const assetName = formik.values.assetName;
        const assetDescription = findAssetDescription(mobileTopicsManaged, assetName);
        setAssetDescription(assetDescription);
        const mobileTopicSelected = findMobileTopicSelected(
            mobileTopicsManaged,
            orgAcronym,
            groupAcronym,
            assetName,
            mobileSensor
        );
        setMobileTopicSelected(mobileTopicSelected);
        setInitialMobileSensorData({
            orgAcronym,
            groupAcronym,
            assetName,
            assetDescription,
            mobileSensor
        });
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
                                        label='Select asset'
                                        name='assetName'
                                        type='text'
                                        options={assetNameOptions}
                                        onChange={(e) => handleChangeAsset(e, formik)}
                                    />
                                    <FieldContainer>
                                        <label>Asset description</label>
                                        <div>{assetDescription}</div>
                                    </FieldContainer>
                                    <FormikControl
                                        control='select'
                                        label='Select asset'
                                        name='assetName'
                                        type='text'
                                        options={assetNameOptions}
                                        onChange={(e) => handleChangeAsset(e, formik)}
                                    />
                                    <FormikControl
                                        control='select'
                                        label='Select mobile sensor'
                                        name='mobileSensor'
                                        type='text'
                                        options={mobileSensorOptions}
                                        onChange={(e) => handleChangeMobileSensor(e, formik)}
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
