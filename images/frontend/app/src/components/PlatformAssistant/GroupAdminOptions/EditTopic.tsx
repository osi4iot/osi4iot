import { FC, useState, SyntheticEvent } from "react";
import { useTable } from "../../../state";
import { Formik, Form, FormikProps } from "formik";
import * as Yup from "yup";
import { useAuthState, useAuthDispatch } from "../../../contexts/authContext";
import { axiosAuth, getDomainName, getProtocol } from "../../../tools/tools";
import { toast } from "react-toastify";
import FormikControl from "../../Tools/FormikControl";
import FormButtonsProps from "../../Tools/FormButtons";
import FormTitle from "../../Tools/FormTitle";
import { TOPICS_OPTIONS } from "../Utils/platformAssistantOptions";
import {
    setTopicsOptionToShow,
    useTopicIdToEdit,
    useTopicRowIndexToEdit,
    useTopicsDispatch,
} from "../../../contexts/topicsOptions";
import { ITopic } from "../TableColumns/topicsColumns";
import { getAxiosInstance } from "../../../tools/axiosIntance";
import axiosErrorHandler from "../../../tools/axiosErrorHandler";
import { FieldContainer } from "./EditAsset";
import { AxiosResponse, AxiosError } from "axios";

// CodeMirror imports
import CodeMirror, { keymap } from "@uiw/react-codemirror";
import { indentUnit, indentOnInput } from "@codemirror/language";
import { completionKeymap } from "@codemirror/autocomplete";
import { indentWithTab } from "@codemirror/commands";
import { json } from "@codemirror/lang-json";
import { oneDark } from "@codemirror/theme-one-dark";
import { CodeMirrorWrapper } from "../../Tools/CodeMirrorWrapper";
import { ControlsContainer, DraggableFormContainer, FieldErrorScroller } from "../../Tools/FormTools";
import { ReIndentCommand } from "../DigitalTwin3DViewer/Pipeline/types";

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

interface IFormikValues {
    topicType: string;
    description: string;
    mqttAccessControl: string;
    payloadJsonSchema: string;
}

type FormikType = FormikProps<IFormikValues>;

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
    const groupsManaged = useTable("groupsManaged");
    const group = groupsManaged.filter((groupManaged) => groupManaged.id === groupId)[0];
    const groupAcronym = group.acronym;
    const orgsOfGroupsManaged = useTable("orgsOfGroupsManaged");
    const organization = orgsOfGroupsManaged.filter((org) => org.id === orgId)[0];
    const orgAcronym = organization.acronym;

    const onSubmit = (values: any, actions: any) => {
        const url = `${protocol}://${domainName}/admin_api/topic/${groupId}/${topicId}`;
        const config = axiosAuth(accessToken);
        setIsSubmitting(true);

        const topicData = {
            topicType: values.topicType,
            description: values.description,
            mqttAccessControl: values.mqttAccessControl,
            payloadJsonSchema: values.payloadJsonSchema,
        };

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
                refreshTopics();
            });
    };

    const initialTopicData = {
        topicType: topics[topicRowIndex].topicType,
        description: topics[topicRowIndex].description,
        mqttAccessControl: topics[topicRowIndex].mqttAccessControl,
        payloadJsonSchema: JSON.stringify(JSON.parse(topics[topicRowIndex].payloadJsonSchema), null, 4),
    };

    const validationSchema = Yup.object().shape({
        topicType: Yup.string().max(40, "The maximum number of characters allowed is 40").required("Required"),
        description: Yup.string().max(190, "The maximum number of characters allowed is 190").required("Required"),
        payloadJsonSchema: Yup.string().required("Required"),
    });

    const onCancel = (e: SyntheticEvent) => {
        e.preventDefault();
        backToTable();
    };

    return (
        <>
            <FormTitle isSubmitting={isSubmitting}>Edit topic</FormTitle>
            <DraggableFormContainer>
                <Formik initialValues={initialTopicData} validationSchema={validationSchema} onSubmit={onSubmit}>
                    {(formik) => (
                        // @ts-ignore
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
                                <CodeMirrorWrapper fontSize="14px">
                                    <label>Payload json schema</label>
                                    <div className="cm-wrapper">
                                        <CodeMirror
                                            value={formik.values.payloadJsonSchema}
                                            height="300px"
                                            theme={oneDark}
                                            extensions={[
                                                json(),
                                                indentUnit.of("    "),
                                                indentOnInput(),
                                                keymap.of([...completionKeymap, indentWithTab, ReIndentCommand]),
                                            ]}

                                            onChange={(value) => {
                                                formik.setFieldValue("payloadJsonSchema", value);
                                            }}
                                            onBlur={() => {
                                                formik.setFieldTouched("payloadJsonSchema", true);
                                            }}
                                            basicSetup={{
                                                lineNumbers: true,
                                                foldGutter: true,
                                                bracketMatching: true,
                                                closeBrackets: true,
                                                syntaxHighlighting: true,
                                                autocompletion: true,
                                                tabSize: 4,
                                                searchKeymap: true,
                                            }}
                                        />
                                    </div>
                                    <FieldErrorScroller name="payloadJsonSchema" />
                                </CodeMirrorWrapper>
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

export default EditTopic;
