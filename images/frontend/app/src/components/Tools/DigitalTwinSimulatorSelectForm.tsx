import { FC, useState, SyntheticEvent, useEffect } from 'react';
import styled from "styled-components";
import { useHistory } from "react-router-dom";
import { Formik, Form, FormikProps } from 'formik';
import FormikControl from "./FormikControl";
import MobileSensorSelectFormButtons from "./MobileSensorSelectFormButtons";
import { IDigitalTwinSimulator } from '../PlatformAssistant/TableColumns/digitalTwinsColumns';
import { InitialDigitalTwinSimulatorData } from '../../pages/DigitalTwinSimulatorMobilePage';

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

const findOrgArray = (digitalTwinSimulatorsManaged: IDigitalTwinSimulator[]): string[] => {
    const orgArray: string[] = []
    for (const digitalTwinSim of digitalTwinSimulatorsManaged) {
        if (orgArray.indexOf(digitalTwinSim.orgAcronym) === -1) {
            orgArray.push(digitalTwinSim.orgAcronym);
        }
    }
    return orgArray;
}

const findGroupArray = (digitalTwinSimulatorsManaged: IDigitalTwinSimulator[]): Record<string, string[]> => {
    const groupArray: Record<string, string[]> = {}
    for (const digitalTwinSim of digitalTwinSimulatorsManaged) {
        if (groupArray[digitalTwinSim.orgAcronym] === undefined) {
            groupArray[digitalTwinSim.orgAcronym] = [];
        }
        if (groupArray[digitalTwinSim.orgAcronym].indexOf(digitalTwinSim.groupAcronym) === -1) {
            groupArray[digitalTwinSim.orgAcronym].push(digitalTwinSim.groupAcronym);
        }
    }
    return groupArray;
}

const findAssetNameArray = (digitalTwinSimulatorsManaged: IDigitalTwinSimulator[]): Record<string, string[]> => {
    const assetArray: Record<string, string[]> = {}
    for (const digitalTwinSim of digitalTwinSimulatorsManaged) {
        if (assetArray[digitalTwinSim.groupAcronym] === undefined) {
            assetArray[digitalTwinSim.groupAcronym] = [];
        }
        const assetName = `Asset_${digitalTwinSim.assetUid}`;
        if (assetArray[digitalTwinSim.groupAcronym].indexOf(assetName) === -1) {
            assetArray[digitalTwinSim.groupAcronym].push(assetName);
        }
    }
    return assetArray;
}

const findAssetDescription = (
    digitalTwinSimulatorsManaged: IDigitalTwinSimulator[],
    assetName: string
): string => {
    const digitalTwinSimulator = digitalTwinSimulatorsManaged.filter(digitalTwinSim =>
        `Asset_${digitalTwinSim.assetUid}` === assetName
    )[0];
    return digitalTwinSimulator.assetDescription;
}

const findDigitalTwinNameArray = (digitalTwinSimulatorsManaged: IDigitalTwinSimulator[]): Record<string, string[]> => {
    const digitalTwinNameArray: Record<string, string[]> = {}
    for (const digitalTwinSim of digitalTwinSimulatorsManaged) {
        const assetName = `Asset_${digitalTwinSim.assetUid}`;
        if (digitalTwinNameArray[assetName] === undefined) {
            digitalTwinNameArray[assetName] = [];
        }
        const digitalTwinName = `DT_${digitalTwinSim.digitalTwinUid}`;
        if (digitalTwinNameArray[assetName].indexOf(digitalTwinName) === -1) {
            digitalTwinNameArray[assetName].push(digitalTwinName);
        }
    }
    return digitalTwinNameArray;
}

const findDigitalTwinDescription = (
    digitalTwinSimulatorsManaged: IDigitalTwinSimulator[],
    digitalTwinName: string
): string => {
    const digitalTwinSimulator = digitalTwinSimulatorsManaged.filter(digitalTwinSim =>
        `DT_${digitalTwinSim.digitalTwinUid}` === digitalTwinName
    )[0];
    return digitalTwinSimulator.digitalTwinDescription;
}

const findDigitalTwinSimulatoricSelected = (
    digitalTwinSimulatorsManaged: IDigitalTwinSimulator[],
    orgAcronym: string,
    groupAcronym: string,
    assetName: string,
    digitalTwinName: string,
): IDigitalTwinSimulator => {
    const  digitalTwinSimulatorSelected = digitalTwinSimulatorsManaged.filter(digitalTwinSim =>
        digitalTwinSim.orgAcronym === orgAcronym &&
        digitalTwinSim.groupAcronym === groupAcronym &&
        `Asset_${digitalTwinSim.assetUid}` === assetName &&
        `DT_${digitalTwinSim.digitalTwinUid}` === digitalTwinName
    )[0];
    return digitalTwinSimulatorSelected
}

type FormikType = FormikProps<InitialDigitalTwinSimulatorData>

interface DigitalTwinSimulatorSelectFormProps {
    isMqttConnected: boolean;
    handleNextButton: (digitalTwinSimulatorSelected: IDigitalTwinSimulator | null) => void
    digitalTwinSimulatorsManaged: IDigitalTwinSimulator[];
    initialDigitalTwinSimulatorData: InitialDigitalTwinSimulatorData;
    setInitialDigitalTwinSimulatorData: React.Dispatch<React.SetStateAction<InitialDigitalTwinSimulatorData | null>>;
    digitalTwinSimulatorSelected: IDigitalTwinSimulator | null;
    setDigitalTwinSimulatorSelected: React.Dispatch<React.SetStateAction<IDigitalTwinSimulator | null>>;
}

const DigitalTwinSimulatorSelectForm: FC<DigitalTwinSimulatorSelectFormProps> = (
    {
        isMqttConnected,
        handleNextButton,
        digitalTwinSimulatorsManaged,
        initialDigitalTwinSimulatorData,
        setInitialDigitalTwinSimulatorData,
        digitalTwinSimulatorSelected,
        setDigitalTwinSimulatorSelected
    }) => {
    const history = useHistory();
    const [orgOptions, setOrgOptions] = useState<IOption[]>([]);
    const [groupArray, setGroupArray] = useState<Record<string, string[]>>({});
    const [groupOptions, setGroupOptions] = useState<IOption[]>([]);
    const [assetNameOptions, setAssetNameOptions] = useState<IOption[]>([]);
    const [assetNameArray, setAssetNameArray] = useState<Record<string, string[]>>({});
    const [assetDescription, setAssetDescription] = useState<string>(initialDigitalTwinSimulatorData.assetDescription);
    const [digitalTwinNameArray, setDigitalTwinNameArray] = useState<Record<string, string[]>>({});
    const [digitalTwinDescription, setDigitalTwinDescription] =
        useState<string>(initialDigitalTwinSimulatorData.digitalTwinDescription);
    const [digitalTwinOptions, setDigitalTwinOptions] = useState<IOption[]>([]);


    useEffect(() => {
        if (digitalTwinSimulatorsManaged.length !== 0) {
            const orgArray = findOrgArray(digitalTwinSimulatorsManaged);
            setOrgOptions(convertArrayToOptions(orgArray));
            const groupArray = findGroupArray(digitalTwinSimulatorsManaged);
            setGroupArray(groupArray);
            const orgAcronym = initialDigitalTwinSimulatorData.orgAcronym;
            const groupsForOrgSelected = groupArray[orgAcronym];
            setGroupOptions(convertArrayToOptions(groupsForOrgSelected));
            const assetNameArray = findAssetNameArray(digitalTwinSimulatorsManaged);
            setAssetNameArray(assetNameArray);
            const groupAcronym = initialDigitalTwinSimulatorData.groupAcronym
            const assetsForGroupSelected = assetNameArray[groupAcronym];
            setAssetNameOptions(convertArrayToOptions(assetsForGroupSelected));
            const assetName = initialDigitalTwinSimulatorData.assetName;
            const assetDescription = findAssetDescription(digitalTwinSimulatorsManaged, assetName);
            setAssetDescription(assetDescription);
            const digitalTwinNameArray = findDigitalTwinNameArray(digitalTwinSimulatorsManaged);
            setDigitalTwinNameArray(digitalTwinNameArray);
            const digitalTwinNamesForAssetSelected = digitalTwinNameArray[assetName];
            setDigitalTwinOptions(convertArrayToOptions(digitalTwinNamesForAssetSelected));
            const digitalTwinName = initialDigitalTwinSimulatorData.digitalTwinName;
            const digitalTwinDescription = findDigitalTwinDescription(digitalTwinSimulatorsManaged, digitalTwinName);
            setDigitalTwinDescription(digitalTwinDescription);
            setDigitalTwinSimulatorSelected(digitalTwinSimulatorsManaged[0]);
        }
    }, [digitalTwinSimulatorsManaged, initialDigitalTwinSimulatorData, setDigitalTwinSimulatorSelected]);


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
        const assetDescription = findAssetDescription(digitalTwinSimulatorsManaged, assetName);
        setAssetDescription(assetDescription);
        formik.setFieldValue("assetDescription", assetDescription);
        const digitalTwinNamesForAssetSelected = digitalTwinNameArray[assetName];
        const digitalTwinName = digitalTwinNamesForAssetSelected[0];
        formik.setFieldValue("digitalTwinName", digitalTwinName);
        setDigitalTwinOptions(convertArrayToOptions(digitalTwinNamesForAssetSelected));
        const digitalTwinDescription = findDigitalTwinDescription(digitalTwinSimulatorsManaged, digitalTwinName);
        setDigitalTwinDescription(digitalTwinDescription);
        formik.setFieldValue("digitalTwinDescription", digitalTwinDescription);
        const digitalTwinSimulatorSelected = findDigitalTwinSimulatoricSelected(
            digitalTwinSimulatorsManaged,
            orgAcronym,
            groupAcronym,
            assetName,
            digitalTwinName
        );
        setDigitalTwinSimulatorSelected(digitalTwinSimulatorSelected);
    }

    const handleChangeGroup = (e: { value: string }, formik: FormikType) => {
        const orgAcronym = formik.values.orgAcronym;
        const groupAcronym = e.value;
        formik.setFieldValue("groupAcronym", groupAcronym);
        const assetsForGroupSelected = assetNameArray[groupAcronym];
        setAssetNameOptions(convertArrayToOptions(assetsForGroupSelected));
        const assetName = assetsForGroupSelected[0];
        formik.setFieldValue("assetName", assetName);
        const assetDescription = findAssetDescription(digitalTwinSimulatorsManaged, assetName);
        setAssetDescription(assetDescription);
        const digitalTwinNamesForAssetSelected = digitalTwinNameArray[assetName];
        const digitalTwinName = digitalTwinNamesForAssetSelected[0];
        formik.setFieldValue("digitalTwinName", digitalTwinName);
        setDigitalTwinOptions(convertArrayToOptions(digitalTwinNamesForAssetSelected));
        const digitalTwinDescription = findDigitalTwinDescription(digitalTwinSimulatorsManaged, digitalTwinName);
        setDigitalTwinDescription(digitalTwinDescription);
        formik.setFieldValue("digitalTwinDescription", digitalTwinDescription);
        const digitalTwinSimulatorSelected = findDigitalTwinSimulatoricSelected(
            digitalTwinSimulatorsManaged,
            orgAcronym,
            groupAcronym,
            assetName,
            digitalTwinName
        );
        setDigitalTwinSimulatorSelected(digitalTwinSimulatorSelected);
    }

    const handleChangeAsset = (e: { value: string }, formik: FormikType) => {
        const orgAcronym = formik.values.orgAcronym;
        const groupAcronym = formik.values.groupAcronym;
        const assetName = e.value;
        formik.setFieldValue("assetName", assetName);
        const assetDescription = findAssetDescription(digitalTwinSimulatorsManaged, assetName);
        setAssetDescription(assetDescription);
        const digitalTwinNamesForAssetSelected = digitalTwinNameArray[assetName];
        const digitalTwinName = digitalTwinNamesForAssetSelected[0];
        formik.setFieldValue("digitalTwinName", digitalTwinName);
        setDigitalTwinOptions(convertArrayToOptions(digitalTwinNamesForAssetSelected));
        const digitalTwinDescription = findDigitalTwinDescription(digitalTwinSimulatorsManaged, digitalTwinName);
        setDigitalTwinDescription(digitalTwinDescription);
        formik.setFieldValue("digitalTwinDescription", digitalTwinDescription);
        const digitalTwinSimulatorSelected = findDigitalTwinSimulatoricSelected(
            digitalTwinSimulatorsManaged,
            orgAcronym,
            groupAcronym,
            assetName,
            digitalTwinName
        );
        setDigitalTwinSimulatorSelected(digitalTwinSimulatorSelected);
    }

    const handleChangeDigitalTwinName = (e: { value: string }, formik: FormikType) => {
        const digitalTwinName = e.value;
        formik.setFieldValue("digitalTwinName", digitalTwinName);
        const orgAcronym = formik.values.orgAcronym;
        const groupAcronym = formik.values.groupAcronym;
        const assetName = formik.values.assetName;
        const assetDescription = findAssetDescription(digitalTwinSimulatorsManaged, assetName);
        setAssetDescription(assetDescription);
        const digitalTwinDescription = findDigitalTwinDescription(digitalTwinSimulatorsManaged, digitalTwinName);
        setDigitalTwinDescription(digitalTwinDescription);
        formik.setFieldValue("digitalTwinDescription", digitalTwinDescription);
        const digitalTwinSimulatorSelected = findDigitalTwinSimulatoricSelected(
            digitalTwinSimulatorsManaged,
            orgAcronym,
            groupAcronym,
            assetName,
            digitalTwinName
        );
        setDigitalTwinSimulatorSelected(digitalTwinSimulatorSelected);

        setInitialDigitalTwinSimulatorData({
            orgAcronym,
            groupAcronym,
            assetName,
            assetDescription,
            digitalTwinName,
            digitalTwinDescription
        });
    }

    return (
        <>
            <Title>
                Select digital twin <ConnectionLed isMqttConnected={isMqttConnected} />
            </Title>
            <FormContainer>
                <Formik
                    initialValues={initialDigitalTwinSimulatorData as InitialDigitalTwinSimulatorData}
                    onSubmit={() => handleNextButton(digitalTwinSimulatorSelected)}
                >
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
                                        label='Select digital twin'
                                        name='digitalTwinName'
                                        type='text'
                                        options={digitalTwinOptions}
                                        onChange={(e) => handleChangeDigitalTwinName(e, formik)}
                                    />
                                    <FieldContainer>
                                        <label>Digital twin description</label>
                                        <div>{digitalTwinDescription}</div>
                                    </FieldContainer>
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

export default DigitalTwinSimulatorSelectForm;
