import { FC, useState, SyntheticEvent } from 'react';
import { Formik, Form, FormikProps } from 'formik';
import * as Yup from 'yup';
import { useAuthState, useAuthDispatch } from '../../../contexts/authContext';
import { axiosAuth, getDomainName, getProtocol } from "../../../tools/tools";
import { toast } from "react-toastify";
import FormikControl from "../../Tools/FormikControl";
import FormButtonsProps from "../../Tools/FormButtons";
import FormTitle from "../../Tools/FormTitle";
import { TOPICS_OPTIONS } from '../Utils/platformAssistantOptions';
import {
    setTopicsOptionToShow,
    useTopicIdToEdit,
    useTopicRowIndexToEdit,
    useTopicsDispatch
} from '../../../contexts/topicsOptions';
import { ITopic } from '../TableColumns/topicsColumns';
import { getAxiosInstance } from '../../../tools/axiosIntance';
import axiosErrorHandler from '../../../tools/axiosErrorHandler';
import { useGroupsManagedTable, useOrgsOfGroupsManagedTable } from '../../../contexts/platformAssistantContext';
import { FieldContainer } from './EditAsset';
import { ControlsContainer, FormContainer } from './CreateAsset';
import { AxiosResponse, AxiosError } from 'axios';

const topicTypeOptions = [
    {
        label: "Device to platform DB",
        value: "dev2pdb"
    },
    {
        label: "Device to platform DB message array",
        value: "dev2pdb_ma"
    },
    {
        label: "Device to platform DB with timestamp",
        value: "dev2pdb_wt"
    },
    {
        label: "Device to DTM",
        value: "dev2dtm"
    },
    {
        label: "DTM to device",
        value: "dtm2dev"
    },
    {
        label: "Device to simulator",
        value: "dev2sim"
    },
    {
        label: "DTM to simulator",
        value: "dtm2sim"
    },
    {
        label: "Simulator to DTM",
        value: "sim2dtm"
    },
    {
        label: "Simulator to LLM",
        value: "sim2llm"
    },
    {
        label: "LLM to simulator",
        value: "llm2sim"
    },
    {
        label: "DTM to platform database",
        value: "dtm2pdb"
    },
    {
        label: "Test topic",
        value: "test"
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

const requireS3StorateOptions = [
    {
        label: "Yes",
        value: "yes"
    },
    {
        label: "No",
        value: "no"
    },
]

interface IFormikValues {
    topicType: string;
    description: string;
    mqttAccessControl: string;
    payloadJsonSchema: string;
    requireS3StorageString: string;
    s3Folder: string;
    parquetSchema: string;
}

type FormikType = FormikProps<IFormikValues>

const domainName = getDomainName();
const protocol = getProtocol();

interface EdiTopicProps {
    topics: ITopic[];
    backToTable: () => void;
    refreshTopics: () => void;
}

const EditTopic: FC<EdiTopicProps> = ({ topics, backToTable, refreshTopics }) => {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();
    const topicsDispatch = useTopicsDispatch();
    const topicRowIndex = useTopicRowIndexToEdit();
    const topicId = useTopicIdToEdit();
    const groupId = topics[topicRowIndex].groupId;
    const orgId = topics[topicRowIndex].orgId;
    const groupsManaged = useGroupsManagedTable();
    const group = groupsManaged.filter(groupManaged => groupManaged.id === groupId)[0];
    const groupAcronym = group.acronym;
    const orgsOfGroupsManaged = useOrgsOfGroupsManagedTable();
    const organization = orgsOfGroupsManaged.filter(org => org.id === orgId)[0];
    const orgAcronym = organization.acronym;
    const [requireS3Storage, setRequireS3Storage] = useState(topics[topicRowIndex].requireS3Storage);

    const onSubmit = (values: any, actions: any) => {
        const url = `${protocol}://${domainName}/admin_api/topic/${groupId}/${topicId}`;
        const config = axiosAuth(accessToken);
        setIsSubmitting(true);

        const topicData = {
            topicType: values.topicType,
            description: values.description,
            mqttAccessControl: values.mqttAccessControl,
            payloadJsonSchema: values.payloadJsonSchema,
            requireS3Storage: requireS3Storage,
            s3Folder: values.s3Folder,
            parquetSchema: values.parquetSchema,
        }

        getAxiosInstance(refreshToken, authDispatch)
            .patch(url, topicData, config)
            .then((response: AxiosResponse<any, any>) => {
                const data = response.data;
                toast.success(data.message);
                const topicsOptionToShow = { topicsOptionToShow: TOPICS_OPTIONS.TABLE };
                setIsSubmitting(false);
                setTopicsOptionToShow(topicsDispatch, topicsOptionToShow);
            })
            .catch((error: AxiosError) => {
                axiosErrorHandler(error, authDispatch);
                backToTable();
            })
            .finally(() => {
                refreshTopics();;
            })
    }

    const initialTopicData = {
        topicType: topics[topicRowIndex].topicType,
        description: topics[topicRowIndex].description,
        mqttAccessControl: topics[topicRowIndex].mqttAccessControl,
        payloadJsonSchema: JSON.stringify(JSON.parse(topics[topicRowIndex].payloadJsonSchema), null, 4),
        requireS3StorageString: topics[topicRowIndex].requireS3Storage ? "yes" : "no",
        s3Folder: topics[topicRowIndex].s3Folder,
        parquetSchema: JSON.stringify(JSON.parse(topics[topicRowIndex].parquetSchema), null, 4),
    }

    const validationSchema = Yup.object().shape({
        topicType: Yup.string().max(40, "The maximum number of characters allowed is 40").required('Required'),
        description: Yup.string().max(190, "The maximum number of characters allowed is 190").required('Required'),
        payloadJsonSchema: Yup.string().required('Required'),
        requireS3StorageString: Yup.string().required('Required'),
        s3Folder: Yup.string().when("requireS3StorageString", {
            is: "yes",
            then: Yup.string().required("Must enter maxNumResFemFiles")
        }),
        parquetSchema: Yup.string().when("requireS3StorageString", {
            is: "yes",
            then: Yup.string().required("Must enter maxNumResFemFiles")
        }),
    });

    const onCancel = (e: SyntheticEvent) => {
        e.preventDefault();
        backToTable();
    };

    const onRequireS3StorageSelectChange = (e: { value: string }, formik: FormikType) => {
        setRequireS3Storage(e.value === "yes" ? true : false);
        formik.setFieldValue("requireS3StorageString", e.value)
    }

    return (
        <>
            <FormTitle isSubmitting={isSubmitting} >Edit topic</FormTitle>
            <FormContainer>
                <Formik initialValues={initialTopicData} validationSchema={validationSchema} onSubmit={onSubmit} >
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
                                    <FormikControl
                                        control='select'
                                        label='Topic type'
                                        name='topicType'
                                        options={topicTypeOptions}
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
                                        label='Mqtt access control'
                                        name="mqttAccessControl"
                                        options={mqttAccessControlOptions}
                                        type='text'
                                    />
                                    <FormikControl
                                        control='textarea'
                                        label='Payload json schema'
                                        name='payloadJsonSchema'
                                        textAreaSize='Small'
                                    />
                                    <FormikControl
                                        control='select'
                                        label='Require S3 storage'
                                        name="requireS3StorageString"
                                        options={requireS3StorateOptions}
                                        type='text'
                                        onChange={(e) => onRequireS3StorageSelectChange(e, formik)}
                                    />
                                    {
                                        requireS3Storage &&
                                        <>
                                            <FormikControl
                                                control='input'
                                                label='S3 folder name'
                                                name='s3Folder'
                                                type='text'
                                            />
                                            <FormikControl
                                                control='textarea'
                                                label='Parquet schema'
                                                name='parquetSchema'
                                                textAreaSize='Small'
                                            />
                                        </>
                                    }
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

export default EditTopic;