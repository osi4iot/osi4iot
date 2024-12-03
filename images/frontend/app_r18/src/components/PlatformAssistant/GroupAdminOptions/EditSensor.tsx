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
import {
    setSensorsOptionToShow,
    useSensorIdToEdit,
    useSensorRowIndexToEdit,
    useSensorsDispatch
} from '../../../contexts/sensorsOptions';
import { ISensor } from '../TableColumns/sensorsColumns';
import { getAxiosInstance } from '../../../tools/axiosIntance';
import axiosErrorHandler from '../../../tools/axiosErrorHandler';
import { useAssetTopicsTable, useAssetsTable, useGroupsManagedTable, useOrgsOfGroupsManagedTable, useSensorTypesTable } from '../../../contexts/platformAssistantContext';
import SvgComponent from '../../Tools/SvgComponent';
import { ISensorType } from '../TableColumns/sensorTypesColumns';
import IAssetTopic from '../TableColumns/assetTopics.interface';
import { FieldContainer } from './EditAsset';
import { ControlsContainer, FormContainer } from './CreateAsset';
import { AxiosResponse, AxiosError } from 'axios';

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

const findSensorTypeArray = (sensorTypes: ISensorType[]): string[] => {
    const sensorTypeArray = sensorTypes.map(sensorType => sensorType.type);
    return sensorTypeArray;
}

const findTopicRefArray = (assetTopics: IAssetTopic[]): string[] => {
    const topicRefArray = assetTopics.map(assetTopic => assetTopic.topicRef);
    return topicRefArray;
}

const domainName = getDomainName();
const protocol = getProtocol();

interface InitialSensorData {
    topicRef: string,
    sensorType: string;
    description: string;
    payloadJsonSchema: string;
}

type FormikType = FormikProps<InitialSensorData>

interface EdiSensorProps {
    sensors: ISensor[];
    backToTable: () => void;
    refreshSensors: () => void;
}

const EditSensor: FC<EdiSensorProps> = ({ sensors, backToTable, refreshSensors }) => {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();
    const sensorsDispatch = useSensorsDispatch();
    const sensorRowIndex = useSensorRowIndexToEdit();
    const storedSensor = sensors[sensorRowIndex];
    const assetTopics = useAssetTopicsTable();
    const assetId = storedSensor.assetId;
    const assetTopicsFiltered = assetTopics.filter(assetTopic => assetTopic.assetId === assetId);
    const sensorTypes = useSensorTypesTable();
    const orgId = storedSensor.orgId;
    const groupsManaged = useGroupsManagedTable();
    const groupId = sensors[sensorRowIndex].groupId;
    const group = groupsManaged.filter(groupManaged => groupManaged.id === groupId)[0];
    const groupAcronym = group.acronym;
    const orgsOfGroupsManaged = useOrgsOfGroupsManagedTable();
    const organization = orgsOfGroupsManaged.filter(org => org.id === group.orgId)[0];
    const orgAcronym = organization.acronym;
    const sensorTypesFiltered = sensorTypes.filter(sensorType => sensorType.orgId === orgId);
    const assets = useAssetsTable();
    const sensorId = useSensorIdToEdit();
    const sensorAsset = assets.filter(asset => asset.id === assetId)[0];
    const assetName = `Asset_${sensorAsset.assetUid}`;
    const assetDescription = sensorAsset.description;
    const sensorTypeId = storedSensor.sensorTypeId;
    const initSensorType = sensorTypes.filter(sensorType => sensorType.id === sensorTypeId)[0];
    const [iconSvgString, setIconSvgString] = useState(initSensorType.iconSvgString);
    const [sensorTypeOptions, setSensorTypeOptions] = useState<IOption[]>([]);
    const [topicRefOptions, setTopicRefOptions] = useState<IOption[]>([]);

    useEffect(() => {
        const sensorTypesFiltered = sensorTypes.filter(sensorType => sensorType.orgId === orgId);
        const sensorTypeArray = findSensorTypeArray(sensorTypesFiltered);
        setSensorTypeOptions(convertArrayToOptions(sensorTypeArray));
        const assetTopicsFiltered = assetTopics.filter(assetTopic => assetTopic.assetId === assetId);
        const topicRefArray = findTopicRefArray(assetTopicsFiltered);
        setTopicRefOptions(convertArrayToOptions(topicRefArray));
    }, [assetId, assetTopics, orgId, sensorTypes]);

    const handleChangeSensorType = (e: { value: string }, formik: FormikType) => {
        const sensorType = e.value;
        formik.setFieldValue("sensorType", sensorType);
        const sensorTypeSelected = sensorTypesFiltered.filter(item => item.type === sensorType)[0];
        setIconSvgString(sensorTypeSelected.iconSvgString);
        const payloadJsonSchema = JSON.stringify(sensorTypeSelected.defaultPayloadJsonSchema, null, 4)
        formik.setFieldValue("payloadJsonSchema", payloadJsonSchema);
    }

    const onSubmit = (values: any, actions: any) => {
        const url = `${protocol}://${domainName}/admin_api/sensor/${groupId}/id/${sensorId}`;
        const config = axiosAuth(accessToken);
        setIsSubmitting(true);

        const topicId = assetTopicsFiltered.filter(assetTopic => assetTopic.topicRef === values.topicRef)[0].topicId;
        const sensorTypeId = sensorTypesFiltered.filter(sensorType => sensorType.type === values.sensorType)[0].id;
        const sensorData = {
            topicId,
            description: values.description,
            sensorTypeId,
            payloadJsonSchema: values.payloadJsonSchema,
        }

        getAxiosInstance(refreshToken, authDispatch)
            .patch(url, sensorData, config)
            .then((response: AxiosResponse<any, any>) => {
                const data = response.data;
                toast.success(data.message);
                const sensorsOptionToShow = { sensorsOptionToShow: SENSORS_OPTIONS.TABLE };
                setIsSubmitting(false);
                setSensorsOptionToShow(sensorsDispatch, sensorsOptionToShow);
            })
            .catch((error: AxiosError) => {
                axiosErrorHandler(error, authDispatch);
                backToTable();
            })
            .finally(() => {
                refreshSensors();
            })
    }

    const initialSensorData = {
        topicRef: assetTopicsFiltered.filter(assetTopic => assetTopic.topicId === storedSensor.topicId)[0].topicRef,
        sensorType: sensorTypesFiltered.filter(sensorType => sensorType.id === storedSensor.sensorTypeId)[0].type,
        description: storedSensor.description,
        payloadJsonSchema: JSON.stringify(storedSensor.payloadJsonSchema, null, 4),
    }

    const validationSchema = Yup.object().shape({
        description: Yup.string().max(190, "The maximum number of characters allowed is 190").required('Required'),
        payloadJsonSchema: Yup.string().required('Required'),
    });

    const onCancel = (e: SyntheticEvent) => {
        e.preventDefault();
        backToTable();
    };

    return (
        <>
            <FormTitle isSubmitting={isSubmitting} >Edit sensor</FormTitle>
            <FormContainer>
                <Formik initialValues={initialSensorData} validationSchema={validationSchema} onSubmit={onSubmit} >
                    {
                        formik => (
                            <Form>
                                <ControlsContainer>
                                    <FieldContainer>
                                        <label>Org acronym</label>
                                        <div>{orgAcronym}</div>
                                    </FieldContainer>
                                    <FieldContainer>
                                        <label>Group acronym</label>
                                        <div>{groupAcronym}</div>
                                    </FieldContainer>
                                    <FieldContainer>
                                        <label>Asset name</label>
                                        <div>{assetName}</div>
                                    </FieldContainer>
                                    <FieldContainer>
                                        <label>Asset description</label>
                                        <div>{assetDescription}</div>
                                    </FieldContainer>
                                    <FormikControl
                                        control='input'
                                        label='Sensor description'
                                        name='description'
                                        type='text'
                                    />
                                    <FormikControl
                                        control='select'
                                        label='Topic reference'
                                        name='topicRef'
                                        options={topicRefOptions}
                                        type='text'
                                    />
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
                                        control='textarea'
                                        label='Payload json schema'
                                        name='payloadJsonSchema'
                                        textAreaSize='Small'
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

export default EditSensor;