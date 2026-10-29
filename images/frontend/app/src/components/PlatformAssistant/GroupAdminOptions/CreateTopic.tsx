import { FC, useState, SyntheticEvent, useEffect } from "react";
import { reloadTable } from "../../../state";
import { Formik, Form, FormikProps } from "formik";
import * as Yup from "yup";
import { useAuthState, useAuthDispatch } from "../../../contexts/authContext";
import { IOption, axiosAuth, convertArrayToOptions, getDomainName, getProtocol } from "../../../tools/tools";
import { toast } from "react-toastify";
import FormikControl from "../../Tools/FormikControl";
import FormButtonsProps from "../../Tools/FormButtons";
import FormTitle from "../../Tools/FormTitle";
import { TOPICS_OPTIONS } from "../Utils/platformAssistantOptions";
import { setTopicsOptionToShow, useTopicsDispatch } from "../../../contexts/topicsOptions";
import { getAxiosInstance } from "../../../tools/axiosIntance";
import axiosErrorHandler from "../../../tools/axiosErrorHandler";
import { IGroupManaged } from "../TableColumns/groupsManagedColumns";
import { IOrgOfGroupsManaged } from "../TableColumns/orgsOfGroupsManagedColumns";
import { AxiosError, AxiosResponse } from "axios";
import { ControlsContainer, DraggableFormContainer } from "../../Tools/FormTools";
import MessageSchemaField from "./MessageSchemaField";
import { isMessageSchemaEditable, messageSchemaTextError } from "../../../tools/messageSchema";


const topicTypeOptions = [
    {
        label: "Device to platform DB",
        value: "dev2pdb",
    },
    {
        label: "Device to platform DB message array",
        value: "dev2pdb_ma",
    },
    {
        label: "Device to platform DB with timestamp",
        value: "dev2pdb_wt",
    },
    {
        label: "Device to DTM",
        value: "dev2dtm",
    },
    {
        label: "DTM to device",
        value: "dtm2dev",
    },
    {
        label: "Device to simulator",
        value: "dev2sim",
    },
    {
        label: "DTM to simulator",
        value: "dtm2sim",
    },
    {
        label: "Simulator to DTM",
        value: "sim2dtm",
    },
    {
        label: "Simulator to LLM",
        value: "sim2llm",
    },
    {
        label: "LLM to simulator",
        value: "llm2sim",
    },
    {
        label: "DTM to platform database",
        value: "dtm2pdb",
    },
    {
        label: "Test topic",
        value: "test",
    },
];

const mqttAccessControlOptions = [
    {
        label: "Subscribe & Publish",
        value: "Pub & Sub",
    },
    {
        label: "Subscribe",
        value: "Sub",
    },
    {
        label: "Publish",
        value: "Pub",
    },
    {
        label: "None",
        value: "None",
    },
];

const findGroupArray = (
    orgsOfGroupManaged: IOrgOfGroupsManaged[],
    groupsManaged: IGroupManaged[],
): Record<string, string[]> => {
    const groupArray: Record<string, string[]> = {};
    for (const group of groupsManaged) {
        const orgAcronym = orgsOfGroupManaged.filter((org) => org.id === group.orgId)[0].acronym;
        if (groupArray[orgAcronym] === undefined) {
            groupArray[orgAcronym] = [];
        }
        if (groupArray[orgAcronym].indexOf(group.acronym) === -1) {
            groupArray[orgAcronym].push(group.acronym);
        }
    }
    return groupArray;
};

interface IFormikValues {
    orgAcronym: string;
    groupAcronym: string;
    topicType: string;
    description: string;
    mqttAccessControl: string;
    messageSchema: string;
}

type FormikType = FormikProps<IFormikValues>;

const domainName = getDomainName();
const protocol = getProtocol();

interface CreateTopicProps {
    backToTable: () => void;
    refreshTopics: () => void;
    orgsOfGroupManaged: IOrgOfGroupsManaged[];
    groupsManaged: IGroupManaged[];
}

const CreateTopic: FC<CreateTopicProps> = ({ orgsOfGroupManaged, groupsManaged, backToTable, refreshTopics }) => {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();
    const topicsDispatch = useTopicsDispatch();
    const [orgOptions, setOrgOptions] = useState<IOption[]>([]);
    const [groupArray, setGroupArray] = useState<Record<string, string[]>>({});
    const [groupOptions, setGroupOptions] = useState<IOption[]>([]);
    const initOrg = orgsOfGroupManaged[0];
    const initGroup = groupsManaged.filter((group) => group.orgId === initOrg.id)[0];

    useEffect(() => {
        const orgArray = orgsOfGroupManaged.map((org) => org.acronym);
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
    };

    const onSubmit = (values: any, actions: any) => {
        const groupAcronym = values.groupAcronym;
        const groupSelected = groupsManaged.filter((group) => group.acronym === groupAcronym)[0];
        const groupId = groupSelected.id;
        const url = `${protocol}://${domainName}/admin_api/topic/${groupId}`;
        const config = axiosAuth(accessToken);

        const topicData = {
            topicType: values.topicType,
            description: values.description,
            mqttAccessControl: values.mqttAccessControl,
            // solo los tipos que escribe el usuario: los demás los calcula la plataforma
            ...(isMessageSchemaEditable(values.topicType) ? { messageSchema: values.messageSchema } : {}),
        };

        setIsSubmitting(true);
        getAxiosInstance(refreshToken, authDispatch)
            .post(url, topicData, config)
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
                refreshTopics();
                reloadTable("assetTopics");
            });
    };

    const initialTopicData = {
        orgAcronym: initOrg.acronym,
        groupAcronym: initGroup.acronym,
        topicType: "dev2pdb",
        description: "",
        mqttAccessControl: "Pub & Sub",
        messageSchema: "{}",
    };

    const validationSchema = Yup.object().shape({
        topicType: Yup.string().max(40, "The maximum number of characters allowed is 40").required("Required"),
        description: Yup.string().max(190, "The maximum number of characters allowed is 190").required("Required"),
        messageSchema: Yup.string().when("topicType", {
            is: (topicType: string) => isMessageSchemaEditable(topicType),
            then: (schema) =>
                schema.required("Required").test("messageSchema", (value, context) => {
                    const error = messageSchemaTextError(value);
                    return error ? context.createError({ message: error }) : true;
                }),
        }),
    });

    const onCancel = (e: SyntheticEvent) => {
        e.preventDefault();
        backToTable();
    };

    return (
        <>
            <FormTitle isSubmitting={isSubmitting}>Create topic</FormTitle>
            <DraggableFormContainer>
                <Formik initialValues={initialTopicData} validationSchema={validationSchema} onSubmit={onSubmit}>
                    {(formik) => (
                        // @ts-ignore
                        <Form>
                            <ControlsContainer>
                                <FormikControl
                                    control="select"
                                    label="Org acronym"
                                    name="orgAcronym"
                                    options={orgOptions}
                                    type="text"
                                    onChange={(e) => handleChangeOrg(e, formik)}
                                />
                                <FormikControl
                                    control="select"
                                    label="Group acronym"
                                    name="groupAcronym"
                                    options={groupOptions}
                                    type="text"
                                />
                                <FormikControl
                                    control="select"
                                    label="Topic type"
                                    name="topicType"
                                    options={topicTypeOptions}
                                    type="text"
                                />
                                <FormikControl control="input" label="Description" name="description" type="text" />
                                <FormikControl
                                    control="select"
                                    label="Mqtt access control"
                                    name="mqttAccessControl"
                                    options={mqttAccessControlOptions}
                                    type="text"
                                />
                                <MessageSchemaField formik={formik} />
                            </ControlsContainer>
                            <FormButtonsProps
                                onCancel={onCancel}
                                isValid={formik.isValid}
                                isSubmitting={formik.isSubmitting}
                            />
                        </Form>
                    )}
                </Formik>
            </DraggableFormContainer>
        </>
    );
};

export default CreateTopic;

