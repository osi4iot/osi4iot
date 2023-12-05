import { FC, useState, SyntheticEvent, useEffect } from 'react';
import { Formik, Form, FormikProps } from 'formik';
import * as Yup from 'yup';
import { useAuthState, useAuthDispatch } from '../../../contexts/authContext';
import { IOption, axiosAuth, convertArrayToOptions, getDomainName, getProtocol } from "../../../tools/tools";
import { toast } from "react-toastify";
import FormikControl from "../../Tools/FormikControl";
import FormButtonsProps from "../../Tools/FormButtons";
import FormTitle from "../../Tools/FormTitle";
import { TOPICS_OPTIONS } from '../Utils/platformAssistantOptions';
import { setTopicsOptionToShow, useTopicsDispatch } from '../../../contexts/topicsOptions';
import { getAxiosInstance } from '../../../tools/axiosIntance';
import axiosErrorHandler from '../../../tools/axiosErrorHandler';
import { setReloadAssetTopicsTable, usePlatformAssitantDispatch } from '../../../contexts/platformAssistantContext';
import { IGroupManaged } from '../TableColumns/groupsManagedColumns';
import { IOrgOfGroupsManaged } from '../TableColumns/orgsOfGroupsManagedColumns';
import { ControlsContainer, FormContainer } from './CreateAsset';

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

const findGroupArray = (
    orgsOfGroupManaged: IOrgOfGroupsManaged[],
    groupsManaged: IGroupManaged[]
): Record<string, string[]> => {
    const groupArray: Record<string, string[]> = {}
    for (const group of groupsManaged) {
        const orgAcronym = orgsOfGroupManaged.filter(org => org.id === group.orgId)[0].acronym;
        if (groupArray[orgAcronym] === undefined) {
            groupArray[orgAcronym] = [];
        }
        if (groupArray[orgAcronym].indexOf(group.acronym) === -1) {
            groupArray[orgAcronym].push(group.acronym);
        }
    }
    return groupArray;
}

interface IFormikValues {
    orgAcronym: string;
    groupAcronym: string;
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

interface CreateTopicProps {
    backToTable: () => void;
    refreshTopics: () => void;
    orgsOfGroupManaged: IOrgOfGroupsManaged[];
    groupsManaged: IGroupManaged[];
}

const CreateTopic: FC<CreateTopicProps> = ({
    orgsOfGroupManaged,
    groupsManaged,
    backToTable,
    refreshTopics
}) => {
    const plaformAssistantDispatch = usePlatformAssitantDispatch();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();
    const topicsDispatch = useTopicsDispatch();
    const [orgOptions, setOrgOptions] = useState<IOption[]>([]);
    const [groupArray, setGroupArray] = useState<Record<string, string[]>>({});
    const [groupOptions, setGroupOptions] = useState<IOption[]>([]);
    const initOrg = orgsOfGroupManaged[0];
    const initGroup = groupsManaged.filter(group => group.orgId === initOrg.id)[0];
    const [requireS3Storage, setRequireS3Storage] = useState(false);

    useEffect(() => {
        const orgArray = orgsOfGroupManaged.map(org => org.acronym);
        setOrgOptions(convertArrayToOptions(orgArray));
        const groupArray = findGroupArray(orgsOfGroupManaged, groupsManaged);
        setGroupArray(groupArray);
        const orgAcronym = orgsOfGroupManaged[0].acronym;
        const groupsForOrgSelected = groupArray[orgAcronym];
        setGroupOptions(convertArrayToOptions(groupsForOrgSelected));
    }, [groupsManaged, orgsOfGroupManaged]);

    const handleChangeOrg = (e: { value: string }, formik: FormikType) => {
        const orgAcronym = e.value;
        formik.setFieldValue("orgAcronym", orgAcronym);
        const groupsForOrgSelected = groupArray[orgAcronym];
        setGroupOptions(convertArrayToOptions(groupsForOrgSelected));
        const groupAcronym = groupsForOrgSelected[0];
        formik.setFieldValue("groupAcronym", groupAcronym);
    }

    const onSubmit = (values: any, actions: any) => {
        const groupAcronym = values.groupAcronym;
        const groupSelected = groupsManaged.filter(group => group.acronym === groupAcronym)[0];
        const groupId = groupSelected.id;
        const url = `${protocol}://${domainName}/admin_api/topic/${groupId}`;
        const config = axiosAuth(accessToken);

        const topicData = {
            topicType: values.topicType,
            description: values.description,
            mqttAccessControl: values.mqttAccessControl,
            payloadJsonSchema: values.payloadJsonSchema,
            requireS3Storage: requireS3Storage,
            s3Folder: values.s3Folder,
            parquetSchema: values.parquetSchema,
        }

        setIsSubmitting(true);
        getAxiosInstance(refreshToken, authDispatch)
            .post(url, topicData, config)
            .then((response) => {
                const data = response.data;
                toast.success(data.message);
                const topicsOptionToShow = { topicsOptionToShow: TOPICS_OPTIONS.TABLE };
                setIsSubmitting(false);
                setTopicsOptionToShow(topicsDispatch, topicsOptionToShow);
            })
            .catch((error) => {
                axiosErrorHandler(error, authDispatch);
                backToTable();
            })
            .finally(() => {
                refreshTopics();
                const reloadAssetTopicsTable = true;
                setReloadAssetTopicsTable(plaformAssistantDispatch, { reloadAssetTopicsTable })
            })
    }


    const initialTopicData = {
        orgAcronym: initOrg.acronym,
        groupAcronym: initGroup.acronym,
        topicType: "dev2pdb",
        description: "",
        mqttAccessControl: "Pub & Sub",
        payloadJsonSchema: "{}",
        requireS3StorageString: "no",
        s3Folder: "",
        parquetSchema: "{}",
    }

    const validationSchema = Yup.object().shape({
        groupId: Yup.number().required('Required'),
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
            <FormTitle isSubmitting={isSubmitting}>Create topic</FormTitle>
            <FormContainer>
                <Formik initialValues={initialTopicData} validationSchema={validationSchema} onSubmit={onSubmit} >
                    {
                        formik => (
                            <Form>
                                <ControlsContainer>
                                    <FormikControl
                                        control='select'
                                        label='Org acronym'
                                        name='orgAcronym'
                                        options={orgOptions}
                                        type='text'
                                        onChange={(e) => handleChangeOrg(e, formik)}
                                    />
                                    <FormikControl
                                        control='select'
                                        label='Group acronym'
                                        name='groupAcronym'
                                        options={groupOptions}
                                        type='text'
                                    />
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

export default CreateTopic;