import { FC, useState, SyntheticEvent, useEffect } from 'react';
import styled from "styled-components";
import { Formik, Form, FormikProps } from 'formik';
import * as Yup from 'yup';
import { useAuthState, useAuthDispatch } from '../../../contexts/authContext';
import { IOption, axiosAuth, convertArrayToOptions, getDomainName, getProtocol } from "../../../tools/tools";
import { toast } from "react-toastify";
import FormikControl from "../../Tools/FormikControl";
import FormButtonsProps from "../../Tools/FormButtons";
import FormTitle from "../../Tools/FormTitle";
import { SENSORS_OPTIONS } from '../Utils/platformAssistantOptions';
import { getAxiosInstance } from '../../../tools/axiosIntance';
import axiosErrorHandler from '../../../tools/axiosErrorHandler';
import { IOrgOfGroupsManaged } from '../TableColumns/orgsOfGroupsManagedColumns';
import { IGroupManaged } from '../TableColumns/groupsManagedColumns';
import SvgComponent from '../../Tools/SvgComponent';
import {
    setReloadDashboardsTable,
    useAssetTopicsTable,
    useAssetsTable, useGroupsManagedTable,
    useOrgsOfGroupsManagedTable,
    usePlatformAssitantDispatch,
    useSensorTypesTable,
    useSensorsTable,
} from '../../../contexts/platformAssistantContext';
import { IAsset } from '../TableColumns/assetsColumns';
import { ISensorType } from '../TableColumns/sensorTypesColumns';
import { setSensorsOptionToShow, useSensorsDispatch } from '../../../contexts/sensorsOptions';
import IAssetTopic from '../TableColumns/assetTopics.interface';
import { ISensor } from '../TableColumns/sensorsColumns';
import { ControlsContainer, FormContainer } from './CreateAsset';

const SvgIconPreviewContainerDiv = styled.div`
    margin: 5px 0;
    width: 100%;
`;

const SvgIconPreviewTitle = styled.div`
    margin-bottom: 5px;
`;

const SvgComponentContainerDiv = styled.div`
    padding: 10px;
    border: 2px solid #2c3235;
    border-radius: 10px;
    width: 100%;
    display: flex;
    flex-direction: row;
    justify-content: center;
    align-items: center;
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
const protocol = getProtocol();

const findOrgArray = (assetsManaged: IAsset[], orgsOfGroupManaged: IOrgOfGroupsManaged[]): string[] => {
    const orgArray: string[] = []
    for (const asset of assetsManaged) {
        const orgAcronym = orgsOfGroupManaged.filter(org => org.id === asset.orgId)[0].acronym;
        if (orgArray.indexOf(orgAcronym) === -1) {
            orgArray.push(orgAcronym);
        }
    }
    return orgArray;
}

const findGroupArray = (
    assetsManaged: IAsset[],
    orgsOfGroupManaged: IOrgOfGroupsManaged[],
    groupsManaged: IGroupManaged[]
): Record<string, string[]> => {
    const groupArray: Record<string, string[]> = {}
    for (const asset of assetsManaged) {
        const orgAcronym = orgsOfGroupManaged.filter(org => org.id === asset.orgId)[0].acronym;
        if (groupArray[orgAcronym] === undefined) {
            groupArray[orgAcronym] = [];
        }
        const groupAcronym = groupsManaged.filter(group => group.id === asset.groupId)[0].acronym;
        if (groupArray[orgAcronym].indexOf(groupAcronym) === -1) {
            groupArray[orgAcronym].push(groupAcronym);
        }
    }
    return groupArray;
}

const findAssetNameArray = (
    assetsManaged: IAsset[],
    groupsManaged: IGroupManaged[]
): Record<string, string[]> => {
    const assetArray: Record<string, string[]> = {}
    for (const asset of assetsManaged) {
        const groupAcronym = groupsManaged.filter(group => group.id === asset.groupId)[0].acronym;
        if (assetArray[groupAcronym] === undefined) {
            assetArray[groupAcronym] = [];
        }
        const assetName = `Asset_${asset.assetUid}`;
        if (assetArray[groupAcronym].indexOf(assetName) === -1) {
            assetArray[groupAcronym].push(assetName);
        }
    }
    return assetArray;
}

const findAssetDescription = (
    assetsManaged: IAsset[],
    assetName: string
): string => {
    const assetManaged = assetsManaged.filter(asset => `Asset_${asset.assetUid}` === assetName)[0];
    return assetManaged.description;
}

const findSensorTypeArray = (
    sensorTypes: ISensorType[],
    orgsOfGroupManaged: IOrgOfGroupsManaged[],
): Record<string, string[]> => {
    const sensorTypeArray: Record<string, string[]> = {}
    for (const sensorType of sensorTypes) {
        const orgAcronym = orgsOfGroupManaged.filter(org => org.id === sensorType.orgId)[0].acronym;
        if (sensorTypeArray[orgAcronym] === undefined) {
            sensorTypeArray[orgAcronym] = [];
        }
        if (sensorTypeArray[orgAcronym].indexOf(sensorType.type) === -1) {
            sensorTypeArray[orgAcronym].push(sensorType.type);
        }
    }
    return sensorTypeArray;
}

const findTopicRefArray = (
    assetTopics: IAssetTopic[],
    assetsManaged: IAsset[],
): Record<string, string[]> => {
    const topicRefArray: Record<string, string[]> = {}
    for (const assetTopic of assetTopics) {
        const assetManaged = assetsManaged.filter(asset => asset.id === assetTopic.assetId)[0];
        const assetName = `Asset_${assetManaged.assetUid}`;
        if (topicRefArray[assetName] === undefined) {
            topicRefArray[assetName] = [];
        }
        if (topicRefArray[assetName].indexOf(assetTopic.topicRef) === -1) {
            topicRefArray[assetName].push(assetTopic.topicRef);
        }
    }
    return topicRefArray;
}

const findSensorTypeSelected = (
    sensorTypes: ISensorType[],
    orgsOfGroupManaged: IOrgOfGroupsManaged[],
    type: string,
    orgAcronym: string
): ISensorType => {
    const orgId = orgsOfGroupManaged.filter(org => org.acronym === orgAcronym)[0].id;
    const sensorTypeSelected = sensorTypes.filter(sensorType =>
        sensorType.type === type && sensorType.orgId === orgId
    )[0];
    return sensorTypeSelected;
}

const findNewSensorRefNum = (storedSensors: ISensor[], assets: IAsset[], assetName: string) => {
    let newSensorRefNum = 1;
    const selectedAsset = assets.filter(asset => `Asset_${asset.assetUid}` === assetName)[0];
    const assetId = selectedAsset.id;
    const storedSensorsFiltered = storedSensors.filter(sensor => sensor.assetId === assetId);
    if (storedSensorsFiltered.length !== 0) {
        const storedSensorsRef = storedSensorsFiltered.map(sensor => sensor.sensorRef);
        const lastSensorRef = storedSensorsRef.sort((a: any, b: any) => a.slice(7) - b.slice(7))[storedSensorsRef.length - 1];
        newSensorRefNum = parseInt(lastSensorRef.slice(7), 10) + 1;
    }
    return newSensorRefNum;
}

interface InitialSensorData {
    orgAcronym: string;
    groupAcronym: string;
    assetName: string;
    assetDescription: string;
    sensorType: string;
    topicRef: string,
    sensorRef: string;
    description: string;
    payloadJsonSchema: string;
}

type FormikType = FormikProps<InitialSensorData>

interface CreateSensorProps {
    backToTable: () => void;
    refreshSensors: () => void;
}

const CreateSensor: FC<CreateSensorProps> = ({
    backToTable,
    refreshSensors
}) => {
    const plaformAssistantDispatch = usePlatformAssitantDispatch();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();
    const sensorsDispatch = useSensorsDispatch();
    const orgsOfGroupManaged = useOrgsOfGroupsManagedTable();
    const groupsManaged = useGroupsManagedTable();
    const sensorTypes = useSensorTypesTable();
    const assets = useAssetsTable();
    const storedSensors = useSensorsTable();
    const assetTopics = useAssetTopicsTable();
    const [orgOptions, setOrgOptions] = useState<IOption[]>([]);
    const [groupArray, setGroupArray] = useState<Record<string, string[]>>({});
    const [groupOptions, setGroupOptions] = useState<IOption[]>([]);
    const [assetNameOptions, setAssetNameOptions] = useState<IOption[]>([]);
    const [assetNameArray, setAssetNameArray] = useState<Record<string, string[]>>({});
    const [assetDescription, setAssetDescription] = useState<string>("");
    const [sensorTypeArray, setSensorTypeAarray] = useState<Record<string, string[]>>({});
    const [sensorTypeOptions, setSensorTypeOptions] = useState<IOption[]>([]);
    const [topicRefArray, setTopicRefAarray] = useState<Record<string, string[]>>({});
    const [topicRefOptions, setTopicRefOptions] = useState<IOption[]>([]);
    const initOrg = orgsOfGroupManaged[0];
    const initGroup = groupsManaged.filter(group => group.orgId === initOrg.id)[0];
    const initAsset = assets.filter(asset => asset.groupId === initGroup.id)[0];
    const initAssetName = `Asset_${initAsset.assetUid}`;
    const initSensorType = sensorTypes.filter(sensorType => sensorType.orgId === initOrg.id)[0];
    const initTopicRef = assetTopics.filter(assetTopic => assetTopic.assetId === initAsset.id)[0];
    const newSensorRefNum = findNewSensorRefNum(storedSensors, assets, initAssetName);
    const [iconSvgString, setIconSvgString] = useState(initSensorType.iconSvgString);

    const initialSensorData = {
        orgAcronym: initOrg.acronym,
        groupAcronym: initGroup.acronym,
        assetName: initAssetName,
        assetDescription: initAsset.description,
        sensorType: initSensorType.type,
        topicRef: initTopicRef.topicRef,
        sensorRef: `sensor_${newSensorRefNum}`,
        description: "",
        payloadJsonSchema: JSON.stringify(initSensorType.defaultPayloadJsonSchema, null, 4)
    }

    useEffect(() => {
        const orgArray = findOrgArray(assets, orgsOfGroupManaged);
        setOrgOptions(convertArrayToOptions(orgArray));
        const groupArray = findGroupArray(assets, orgsOfGroupManaged, groupsManaged);
        setGroupArray(groupArray);
        const orgAcronym = initOrg.acronym;
        const groupsForOrgSelected = groupArray[orgAcronym];
        setGroupOptions(convertArrayToOptions(groupsForOrgSelected));
        const assetNameArray = findAssetNameArray(assets, groupsManaged);
        setAssetNameArray(assetNameArray);
        const groupAcronym = initGroup.acronym;
        const assetsForGroupSelected = assetNameArray[groupAcronym];
        setAssetNameOptions(convertArrayToOptions(assetsForGroupSelected));
        const assetName = `Asset_${initAsset.assetUid}`;
        const assetDescription = findAssetDescription(assets, assetName);
        setAssetDescription(assetDescription);
        const sensorTypeArray = findSensorTypeArray(sensorTypes, orgsOfGroupManaged);
        setSensorTypeAarray(sensorTypeArray);
        const sensorTypesForOrgSelected = sensorTypeArray[orgAcronym];
        setSensorTypeOptions(convertArrayToOptions(sensorTypesForOrgSelected));
        const topicRefArray = findTopicRefArray(assetTopics, assets);
        setTopicRefAarray(topicRefArray);
        const topicsRefForAssetSelected = topicRefArray[assetName];
        setTopicRefOptions(convertArrayToOptions(topicsRefForAssetSelected));
    }, [
        assetTopics,
        assets,
        groupsManaged,
        initAsset.assetUid,
        initGroup.acronym,
        initOrg.acronym,
        orgsOfGroupManaged,
        sensorTypes
    ]);

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
        const assetDescription = findAssetDescription(assets, assetName);
        setAssetDescription(assetDescription);
        const sensorTypesForOrgSelected = sensorTypeArray[orgAcronym];
        const sensorType = sensorTypesForOrgSelected[0];
        formik.setFieldValue("sensorType", sensorType);
        const topicsRefForAssetSelected = topicRefArray[assetName];
        const topicRef = topicsRefForAssetSelected[0];
        formik.setFieldValue("topicRef", topicRef);
        const newSensorRefNum = findNewSensorRefNum(storedSensors, assets, assetName);
        formik.setFieldValue("sensorRef", `sensor_${newSensorRefNum}`);
        const sensorTypeSelected = findSensorTypeSelected(sensorTypes, orgsOfGroupManaged, sensorType, orgAcronym);
        setIconSvgString(sensorTypeSelected.iconSvgString);
        const payloadJsonSchema = JSON.stringify(sensorTypeSelected.defaultPayloadJsonSchema, null, 4)
        formik.setFieldValue("payloadJsonSchema", payloadJsonSchema);
    }

    const handleChangeGroup = (e: { value: string }, formik: FormikType) => {
        const orgAcronym = formik.values.orgAcronym;
        const groupAcronym = e.value;
        formik.setFieldValue("groupAcronym", groupAcronym);
        const assetsForGroupSelected = assetNameArray[groupAcronym];
        setAssetNameOptions(convertArrayToOptions(assetsForGroupSelected));
        const assetName = assetsForGroupSelected[0];
        formik.setFieldValue("assetName", assetName);
        const assetDescription = findAssetDescription(assets, assetName);
        setAssetDescription(assetDescription);
        const sensorTypesForOrgSelected = sensorTypeArray[orgAcronym];
        const sensorType = sensorTypesForOrgSelected[0];
        formik.setFieldValue("sensorType", sensorType);
        const topicsRefForAssetSelected = topicRefArray[assetName];
        const topicRef = topicsRefForAssetSelected[0];
        formik.setFieldValue("topicRef", topicRef);
        const newSensorRefNum = findNewSensorRefNum(storedSensors, assets, assetName);
        formik.setFieldValue("sensorRef", `sensor_${newSensorRefNum}`);
        const sensorTypeSelected = findSensorTypeSelected(sensorTypes, orgsOfGroupManaged, sensorType, orgAcronym);
        setIconSvgString(sensorTypeSelected.iconSvgString);
        const payloadJsonSchema = JSON.stringify(sensorTypeSelected.defaultPayloadJsonSchema, null, 4)
        formik.setFieldValue("payloadJsonSchema", payloadJsonSchema);
    }

    const handleChangeAsset = (e: { value: string }, formik: FormikType) => {
        const orgAcronym = formik.values.orgAcronym;
        const assetName = e.value;
        formik.setFieldValue("assetName", assetName);
        const assetDescription = findAssetDescription(assets, assetName);
        setAssetDescription(assetDescription);
        const sensorTypesForOrgSelected = sensorTypeArray[orgAcronym];
        const sensorType = sensorTypesForOrgSelected[0];
        formik.setFieldValue("sensorType", sensorType);
        const topicsRefForAssetSelected = topicRefArray[assetName];
        const topicRef = topicsRefForAssetSelected[0];
        formik.setFieldValue("topicRef", topicRef);
        const newSensorRefNum = findNewSensorRefNum(storedSensors, assets, assetName);
        formik.setFieldValue("sensorRef", `sensor_${newSensorRefNum}`);
        const sensorTypeSelected = findSensorTypeSelected(sensorTypes, orgsOfGroupManaged, sensorType, orgAcronym);
        setIconSvgString(sensorTypeSelected.iconSvgString);
        const payloadJsonSchema = JSON.stringify(sensorTypeSelected.defaultPayloadJsonSchema, null, 4)
        formik.setFieldValue("payloadJsonSchema", payloadJsonSchema);
    }

    const handleChangeSensorType = (e: { value: string }, formik: FormikType) => {
        const sensorType = e.value;
        formik.setFieldValue("sensorType", sensorType);
        const orgAcronym = formik.values.orgAcronym;
        const sensorTypeSelected = findSensorTypeSelected(sensorTypes, orgsOfGroupManaged, sensorType, orgAcronym);
        setIconSvgString(sensorTypeSelected.iconSvgString);
        const payloadJsonSchema = JSON.stringify(sensorTypeSelected.defaultPayloadJsonSchema, null, 4)
        formik.setFieldValue("payloadJsonSchema", payloadJsonSchema);
    }

    const onSubmit = (values: any, actions: any) => {
        const groupId = groupsManaged.filter(group => group.acronym === values.groupAcronym)[0].id;
        const assetName = values.assetName;
        const assetId = assets.filter(asset => asset.assetUid === assetName.slice(6))[0].id;
        const url = `${protocol}://${domainName}/admin_api/sensor/${groupId}/${assetId}`;
        const config = axiosAuth(accessToken);
        const topicId = assetTopics.filter(assetTopic => assetTopic.topicRef === values.topicRef)[0].topicId;
        const sensorTypeId = sensorTypes.filter(sensorType => sensorType.type === values.sensorType)[0].id;
        const sensorData = {
            topicId,
            description: values.description,
            sensorTypeId,
            sensorRef: values.sensorRef,
            payloadJsonSchema: values.payloadJsonSchema,
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
                const reloadDashboardsTable = true;
                setReloadDashboardsTable(plaformAssistantDispatch, { reloadDashboardsTable });
            })
    }

    const validationSchema = Yup.object().shape({
        description: Yup.string().max(190, "The maximum number of characters allowed is 190").required('Required'),
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
                                        label='Sensor type'
                                        name='sensorType'
                                        options={sensorTypeOptions}
                                        type='text'
                                        onChange={(e) => handleChangeSensorType(e, formik)}
                                    />
                                    {
                                        iconSvgString !== "" &&
                                        <SvgIconPreviewContainerDiv>
                                            <SvgIconPreviewTitle>
                                                Icon preview
                                            </SvgIconPreviewTitle>
                                            <SvgComponentContainerDiv>
                                                <SvgComponent
                                                    svgString={iconSvgString}
                                                    imgWidth="100"
                                                    imgHeight="100"
                                                    backgroundColor="#202226"
                                                />
                                            </SvgComponentContainerDiv>
                                        </SvgIconPreviewContainerDiv>
                                    }
                                    <FormikControl
                                        control='select'
                                        label='Topic reference'
                                        name='topicRef'
                                        options={topicRefOptions}
                                        type='text'
                                    />
                                    <FormikControl
                                        control='input'
                                        label='Sensor reference'
                                        name='sensorRef'
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
                                        textAreaSize='Large'
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