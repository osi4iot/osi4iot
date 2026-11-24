// Edit a digital twin: its description, the knowledge base documents its AI agents may read, the chat assistant and
// whether its pipeline needs a GPU. Its Viewer data (3D model, FEM results, simulator format, viewer configuration,
// pipeline) is loaded from the Viewer (Viewer data), or here once the form is saved. What the form does not show is
// kept as it is (admin_api keeps the stored values of the fields it does not receive).
import { FC, useState, SyntheticEvent } from "react";
import { reloadTable, useTable } from "../../../state";
import styled from "styled-components";
import { Formik, Form } from "formik";
import * as Yup from "yup";
import { useAuthState, useAuthDispatch } from "../../../contexts/authContext";
import { axiosAuth, getDomainName, getProtocol } from "../../../tools/tools";
import { toast } from "react-toastify";
import FormikControl from "../../Tools/FormikControl";
import FormButtonsProps from "../../Tools/FormButtons";
import FormTitle from "../../Tools/FormTitle";
import { DIGITAL_TWINS_OPTIONS } from "../Utils/platformAssistantOptions";
import {
    setDigitalTwinsOptionToShow,
    useDigitalTwinIdToEdit,
    useDigitalTwinRowIndexToEdit,
    useDigitalTwinsDispatch,
} from "../../../contexts/digitalTwinsOptions";
import { IDigitalTwin } from "../TableColumns/digitalTwinsColumns";
import { getAxiosInstance } from "../../../tools/axiosIntance";
import axiosErrorHandler from "../../../tools/axiosErrorHandler";
import { FieldContainer } from "./EditAsset";
import { AxiosResponse, AxiosError } from "axios";
import { ControlsContainer, DraggableFormContainer, FormSection } from "../../Tools/FormTools";
import KnowledgeDocumentsSelector from "./KnowledgeDocumentsSelector";
import ViewerDataFileField from "./ViewerDataFileField";
import { ChatAssistantSection, pipelineRequiresGpuOptions } from "./CreateDigitalTwin";
import { ViewerDataSet } from "../DigitalTwin3DViewer/Workspace/viewerData";
import { applyViewerData } from "../DigitalTwin3DViewer/Workspace/viewerDataApi";

const Container = styled.div`
    border: 2px solid #2c3235;
    border-radius: 10px;
    padding: 10px;
    width: 100%;
    margin-bottom: 20px;
`;

const domainName = getDomainName();
const protocol = getProtocol();

interface EditDigitalTwinProps {
    digitalTwins: IDigitalTwin[];
    backToTable: () => void;
    refreshDigitalTwins: () => void;
}

interface IFormikValues {
    description: string;
    chatAssistantEnabled: boolean;
    chatAssistantLanguage: string;
    chatAssistantSecondLanguage: string;
    chatAssistantVoiceLanguage: string;
    chatMobileVoiceEnabled: boolean;
    chatTelegramChatId: string;
    pipelineRequiresGpu: boolean;
}

const EditDigitalTwin: FC<EditDigitalTwinProps> = ({ digitalTwins, backToTable, refreshDigitalTwins }) => {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();
    const digitalTwinsDispatch = useDigitalTwinsDispatch();
    const digitalTwinRowIndex = useDigitalTwinRowIndexToEdit();
    const digitalTwin = digitalTwins[digitalTwinRowIndex];
    const digitalTwinId = useDigitalTwinIdToEdit();
    const groupId = digitalTwin.groupId;
    const groupsManaged = useTable("groupsManaged");
    const group = groupsManaged.filter((groupManaged) => groupManaged.id === groupId)[0];
    const orgsOfGroupsManaged = useTable("orgsOfGroupsManaged");
    const organization = orgsOfGroupsManaged.filter((org) => org.id === digitalTwin.orgId)[0];
    const digitalTwinUid = digitalTwin.digitalTwinUid;
    // The knowledge base documents its AI agents may read: none unless chosen.
    const [knowledgeDocuments, setKnowledgeDocuments] = useState<string[]>(digitalTwin.knowledgeDocuments || []);
    const [isChatAssistantEnabled, setIsChatAssistantEnabled] = useState(digitalTwin.chatAssistantEnabled);
    // the Viewer data to load once the form is saved
    const [viewerData, setViewerData] = useState<ViewerDataSet | null>(null);

    const backToTableView = () => {
        setIsSubmitting(false);
        setDigitalTwinsOptionToShow(digitalTwinsDispatch, { digitalTwinsOptionToShow: DIGITAL_TWINS_OPTIONS.TABLE });
    };

    const onSubmit = (values: IFormikValues) => {
        const url = `${protocol}://${domainName}/admin_api/digital_twin/${groupId}/${digitalTwinId}`;
        const config = axiosAuth(accessToken);
        setIsSubmitting(true);
        const chatAssistantLanguage = values.chatAssistantEnabled ? values.chatAssistantLanguage : "none";
        // only what the form shows: the type, the simulator format, the FEM results kept and the model's sensors stay
        const digitalTwinData = {
            digitalTwinUid,
            description: values.description,
            chatAssistantEnabled: values.chatAssistantEnabled,
            chatAssistantLanguage,
            // chat bilingüe: segundo idioma y en qué idioma se leen las respuestas
            chatAssistantSecondLanguage: values.chatAssistantEnabled ? values.chatAssistantSecondLanguage || "none" : "none",
            chatAssistantVoiceLanguage: values.chatAssistantVoiceLanguage || "question",
            // canales del chat: notas de voz del móvil y un chat de Telegram ("": ninguno)
            chatMobileVoiceEnabled: values.chatAssistantEnabled ? values.chatMobileVoiceEnabled === true : false,
            chatTelegramChatId: values.chatAssistantEnabled ? String(values.chatTelegramChatId ?? "").trim() : "",
            pipelineRequiresGpu: values.pipelineRequiresGpu,
            knowledgeDocuments,
        };

        getAxiosInstance(refreshToken, authDispatch)
            .patch(url, digitalTwinData, config)
            .then(async (response: AxiosResponse<any, any>) => {
                if (response.data) toast.success(response.data.message);
                if (viewerData && viewerData.items.length > 0) {
                    toast.info("Loading the viewer data…");
                    await applyViewerData({ groupId, digitalTwinId }, viewerData.items, {
                        auth: { accessToken, refreshToken, authDispatch },
                        viewerSettings: digitalTwin.viewerSettings as Record<string, unknown> | null | undefined,
                    });
                }
                backToTableView();
            })
            .catch((error: AxiosError) => {
                setIsSubmitting(false);
                axiosErrorHandler(error, authDispatch);
                backToTable();
            })
            .finally(() => {
                refreshDigitalTwins();
                reloadTable("topics");
                reloadTable("sensors");
                reloadTable("dashboards");
            });
    };

    const initialDigitalTwinData: IFormikValues = {
        description: digitalTwin.description,
        chatAssistantEnabled: digitalTwin.chatAssistantEnabled,
        chatAssistantLanguage: digitalTwin.chatAssistantLanguage,
        chatAssistantSecondLanguage: digitalTwin.chatAssistantSecondLanguage || "none",
        chatAssistantVoiceLanguage: digitalTwin.chatAssistantVoiceLanguage || "question",
        chatMobileVoiceEnabled: digitalTwin.chatMobileVoiceEnabled === true,
        chatTelegramChatId: digitalTwin.chatTelegramChatId || "",
        pipelineRequiresGpu: digitalTwin.pipelineRequiresGpu,
    };

    const validationSchema = Yup.object().shape({
        chatTelegramChatId: Yup.string().matches(/^\s*(-?\d{1,20})?\s*$/, "A Telegram chat id is a number (negative for groups)"),
        description: Yup.string().required("Required"),
    });

    const onCancel = (e: SyntheticEvent) => {
        e.preventDefault();
        backToTable();
    };

    return (
        <>
            <FormTitle isSubmitting={isSubmitting}>Edit digital twin</FormTitle>
            <DraggableFormContainer>
                <Formik initialValues={initialDigitalTwinData} validationSchema={validationSchema} onSubmit={onSubmit}>
                    {(formik) => (
                        // @ts-ignore
                        <Form>
                            <ControlsContainer>
                                <FieldContainer>
                                    <label>Org acronym</label>
                                    <div>{organization.acronym}</div>
                                </FieldContainer>
                                <FieldContainer>
                                    <label>Group acronym</label>
                                    <div>{group.acronym}</div>
                                </FieldContainer>
                                <FieldContainer>
                                    <label>DigitalTwinUid</label>
                                    <div>{digitalTwinUid}</div>
                                </FieldContainer>
                                <FormikControl control="input" label="Description" name="description" type="text" />
                                <KnowledgeDocumentsSelector
                                    groupId={groupId}
                                    ragEnabled={organization?.ragEnabled === true && group?.ragEnabled === true}
                                    selected={knowledgeDocuments}
                                    onChange={setKnowledgeDocuments}
                                />
                                {organization.llmEnabled && group.llmEnabled && (
                                    <ChatAssistantSection formik={formik} enabled={isChatAssistantEnabled} onEnabled={setIsChatAssistantEnabled} />
                                )}
                                {organization.gpuUsageEnabled && group.gpuUsageEnabled && (
                                    <FormSection title="Pipeline">
                                        <Container>
                                            <FormikControl
                                                control="select"
                                                label="Pipeline requires GPU"
                                                name="pipelineRequiresGpu"
                                                options={pipelineRequiresGpuOptions}
                                                type="text"
                                            />
                                        </Container>
                                    </FormSection>
                                )}
                                <ViewerDataFileField value={viewerData} onChange={setViewerData} replaces />
                            </ControlsContainer>
                            <FormButtonsProps onCancel={onCancel} isValid={formik.isValid} isSubmitting={formik.isSubmitting || isSubmitting} />
                        </Form>
                    )}
                </Formik>
            </DraggableFormContainer>
        </>
    );
};

export default EditDigitalTwin;
