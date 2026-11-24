// Create a digital twin: only what it needs to exist — its asset, its description, the knowledge base documents its AI
// agents may read, the chat assistant and whether its pipeline needs a GPU. What its Viewer shows (3D model, FEM
// results, simulator format, viewer configuration) and its pipeline are its Viewer data: optional here, loaded from the
// Viewer at any time (Viewer data). Its type follows the 3D model loaded (admin_api digitalTwinParts.ts).
import { isVirtualAsset } from "./ControlRoomButton";
import { reloadTable, useTable } from "../../../state";
import { FC, useState, SyntheticEvent, useEffect, useMemo } from "react";
import styled from "styled-components";
import { Formik, Form, FormikProps } from "formik";
import * as Yup from "yup";
import { nanoid } from "nanoid";
import { useAuthState, useAuthDispatch } from "../../../contexts/authContext";
import { axiosAuth, convertArrayToOptions, getDomainName, getProtocol, IOption } from "../../../tools/tools";
import { toast } from "react-toastify";
import FormikControl from "../../Tools/FormikControl";
import FormButtonsProps from "../../Tools/FormButtons";
import FormTitle from "../../Tools/FormTitle";
import { DIGITAL_TWINS_OPTIONS } from "../Utils/platformAssistantOptions";
import { setDigitalTwinsOptionToShow, useDigitalTwinsDispatch } from "../../../contexts/digitalTwinsOptions";
import { getAxiosInstance } from "../../../tools/axiosIntance";
import axiosErrorHandler from "../../../tools/axiosErrorHandler";
import { IGroupManaged } from "../TableColumns/groupsManagedColumns";
import { IOrgOfGroupsManaged } from "../TableColumns/orgsOfGroupsManagedColumns";
import { IAsset } from "../TableColumns/assetsColumns";
import { AxiosError, AxiosResponse } from "axios";
import KnowledgeDocumentsSelector from "./KnowledgeDocumentsSelector";
import ViewerDataFileField from "./ViewerDataFileField";
import { ViewerDataSet } from "../DigitalTwin3DViewer/Workspace/viewerData";
import { applyViewerData } from "../DigitalTwin3DViewer/Workspace/viewerDataApi";
import {
    CHAT_PRIMARY_LANGUAGE_OPTIONS,
    CHAT_SECOND_LANGUAGE_OPTIONS,
    CHAT_VOICE_LANGUAGE_OPTIONS,
    isBilingualChat,
} from "../DigitalTwin3DViewer/ChatAssitant/chatLanguages";
import { ControlsContainer, DraggableFormContainer, FormSection } from "../../Tools/FormTools";
import { assetOptions, sortAssetNamesByDescription } from "../../../tools/tools";

// the helpers that read the sensors of a 3D model live in tools (kept here for what imports them from this file)
export { getSensorsRef, getSensorsRefFromDigitalTwinGltfData } from "../../../tools/modelSensorsRef";

const Container = styled.div`
    border: 2px solid #2c3235;
    border-radius: 10px;
    padding: 10px;
    width: 100%;
    margin-bottom: 20px;
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

export const pipelineRequiresGpuOptions = [
    { label: "Required", value: true },
    { label: "Not Required", value: false },
];

export const chatAssistantEnabledOptions = [
    { label: "Yes", value: true },
    { label: "No", value: false },
];

// canales del chat: notas de voz del móvil
export const chatChannelYesNoOptions = [
    { label: "Yes: they go to the chat of the user who records them", value: true },
    { label: "No", value: false },
];

export interface ITopicRef {
    topicId: number;
    topicRef: string;
}

const domainName = getDomainName();
const protocol = getProtocol();

const findGroupArray = (orgsOfGroupManaged: IOrgOfGroupsManaged[], groupsManaged: IGroupManaged[]): Record<string, string[]> => {
    const groupArray: Record<string, string[]> = {};
    for (const group of groupsManaged) {
        const orgAcronym = orgsOfGroupManaged.filter((org) => org.id === group.orgId)[0].acronym;
        if (groupArray[orgAcronym] === undefined) groupArray[orgAcronym] = [];
        if (groupArray[orgAcronym].indexOf(group.acronym) === -1) groupArray[orgAcronym].push(group.acronym);
    }
    return groupArray;
};

const findAssetNameArray = (assetsManaged: IAsset[], groupsManaged: IGroupManaged[]): Record<string, string[]> => {
    const descriptions: Record<string, string> = {};
    const assetArray: Record<string, string[]> = {};
    for (const asset of assetsManaged) {
        const groupAcronym = groupsManaged.filter((group) => group.id === asset.groupId)[0].acronym;
        if (assetArray[groupAcronym] === undefined) assetArray[groupAcronym] = [];
        const assetName = `Asset_${asset.assetUid}`;
        descriptions[assetName] = asset.description;
        if (assetArray[groupAcronym].indexOf(assetName) === -1) assetArray[groupAcronym].push(assetName);
    }
    return sortAssetNamesByDescription(assetArray, descriptions);
};

const findAssetDescription = (assetsManaged: IAsset[], assetName: string): string => {
    const assetManaged = assetsManaged.filter((asset) => `Asset_${asset.assetUid}` === assetName)[0];
    return assetManaged.description;
};

interface CreateDigitalTwinProps {
    backToTable: () => void;
    refreshDigitalTwins: () => void;
}

interface IFormikValues {
    orgAcronym: string;
    groupAcronym: string;
    assetName: string;
    digitalTwinUid: string;
    description: string;
    chatAssistantEnabled: boolean;
    chatAssistantLanguage: string;
    chatAssistantSecondLanguage: string;
    chatAssistantVoiceLanguage: string;
    chatMobileVoiceEnabled: boolean;
    chatTelegramChatId: string;
    pipelineRequiresGpu: boolean;
}

type FormikType = FormikProps<IFormikValues>;

const CreateDigitalTwin: FC<CreateDigitalTwinProps> = ({ backToTable, refreshDigitalTwins }) => {
    const digitalTwinUid = useMemo(() => nanoid(20).replace(/-/g, "x").replace(/_/g, "X"), []);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();
    const digitalTwinsDispatch = useDigitalTwinsDispatch();
    const orgsOfGroupManaged = useTable("orgsOfGroupsManaged");
    const groupsManaged = useTable("groupsManaged");
    // a control room gets its digital twin with it (Create control room)
    const allAssets = useTable("assets");
    const assets = useMemo(() => allAssets.filter((asset) => !isVirtualAsset(asset)), [allAssets]);
    const initOrg = orgsOfGroupManaged[0];
    const initGroup = groupsManaged.filter((group) => group.orgId === initOrg.id)[0];
    const initAsset = assets.filter((asset) => asset.groupId === initGroup.id)[0];
    const initAssetName = `Asset_${initAsset.assetUid}`;
    const [orgOptions, setOrgOptions] = useState<IOption[]>([]);
    const [groupArray, setGroupArray] = useState<Record<string, string[]>>({});
    const [groupOptions, setGroupOptions] = useState<IOption[]>([]);
    const [assetNameOptions, setAssetNameOptions] = useState<IOption[]>([]);
    const [assetNameArray, setAssetNameArray] = useState<Record<string, string[]>>({});
    const [isChatAssistantEnabled, setIsChatAssistantEnabled] = useState(false);
    const [orgLlmEnabled, setOrgLlmEnabled] = useState(false);
    const [groupLlmEnabled, setGroupLlmEnabled] = useState(false);
    const [gpuUsageEnabledInOrg, setGpuUsageEnabledInOrg] = useState(false);
    const [gpuUsageEnabledInGroup, setGpuUsageEnabledInGroup] = useState(false);
    // The knowledge base documents its AI agents may read: none unless chosen.
    const [knowledgeDocuments, setKnowledgeDocuments] = useState<string[]>([]);
    // the Viewer data to load once the twin exists
    const [viewerData, setViewerData] = useState<ViewerDataSet | null>(null);

    useEffect(() => {
        const orgArray = orgsOfGroupManaged.map((org) => org.acronym);
        setOrgOptions(convertArrayToOptions(orgArray));
        const groupArray = findGroupArray(orgsOfGroupManaged, groupsManaged);
        setGroupArray(groupArray);
        const orgAcronym = initOrg.acronym;
        setGroupOptions(convertArrayToOptions(groupArray[orgAcronym]));
        const assetNameArray = findAssetNameArray(assets, groupsManaged);
        setAssetNameArray(assetNameArray);
        setAssetNameOptions(assetOptions(assetNameArray[initGroup.acronym], (name) => findAssetDescription(assets, name)));
        const org = orgsOfGroupManaged.filter((o) => o.acronym === orgAcronym)[0];
        setOrgLlmEnabled(org.llmEnabled);
        setGpuUsageEnabledInOrg(org.gpuUsageEnabled);
        const group = groupsManaged.filter((g) => g.acronym === initGroup.acronym)[0];
        setGroupLlmEnabled(group.llmEnabled);
        setGpuUsageEnabledInGroup(group.gpuUsageEnabled);
    }, [assets, groupsManaged, initAsset.assetUid, initGroup.acronym, initOrg.acronym, orgsOfGroupManaged]);

    const handleChangeOrg = (e: { value: string }, formik: FormikType) => {
        const orgAcronym = e.value;
        formik.setFieldValue("orgAcronym", orgAcronym);
        const groupsForOrgSelected = groupArray[orgAcronym];
        setGroupOptions(convertArrayToOptions(groupsForOrgSelected));
        const groupAcronym = groupsForOrgSelected[0];
        formik.setFieldValue("groupAcronym", groupAcronym);
        const assetsForGroupSelected = assetNameArray[groupAcronym];
        setAssetNameOptions(assetOptions(assetsForGroupSelected, (name) => findAssetDescription(assets, name)));
        formik.setFieldValue("assetName", assetsForGroupSelected[0]);
        const org = orgsOfGroupManaged.filter((o) => o.acronym === orgAcronym)[0];
        setOrgLlmEnabled(org.llmEnabled);
        setGpuUsageEnabledInOrg(org.gpuUsageEnabled);
        setKnowledgeDocuments([]);
    };

    const handleChangeGroup = (e: { value: string }, formik: FormikType) => {
        const groupAcronym = e.value;
        formik.setFieldValue("groupAcronym", groupAcronym);
        const assetsForGroupSelected = assetNameArray[groupAcronym];
        setAssetNameOptions(assetOptions(assetsForGroupSelected, (name) => findAssetDescription(assets, name)));
        formik.setFieldValue("assetName", assetsForGroupSelected[0]);
        const group = groupsManaged.filter((g) => g.acronym === groupAcronym)[0];
        setGroupLlmEnabled(group.llmEnabled);
        setGpuUsageEnabledInGroup(group.gpuUsageEnabled);
        // The documents are the group's.
        setKnowledgeDocuments([]);
    };

    const onSubmit = (values: IFormikValues) => {
        const groupId = groupsManaged.filter((group) => group.acronym === values.groupAcronym)[0].id;
        const assetId = assets.filter((asset) => asset.assetUid === values.assetName.slice(6))[0].id;
        const url = `${protocol}://${domainName}/admin_api/digital_twin/${groupId}/${assetId}`;
        const config = axiosAuth(accessToken);
        const chatAssistantLanguage = values.chatAssistantEnabled ? values.chatAssistantLanguage : "none";
        const digitalTwinData = {
            description: values.description,
            // without a 3D model until one is loaded (Viewer data): its type follows it
            type: "Grafana dashboard",
            digitalTwinUid: values.digitalTwinUid,
            maxNumResFemFiles: 1,
            chatAssistantEnabled: values.chatAssistantEnabled,
            chatAssistantLanguage,
            // chat bilingüe: segundo idioma y en qué idioma se leen las respuestas
            chatAssistantSecondLanguage: values.chatAssistantEnabled ? values.chatAssistantSecondLanguage || "none" : "none",
            chatAssistantVoiceLanguage: values.chatAssistantVoiceLanguage || "question",
            // canales del chat: notas de voz del móvil y un chat de Telegram ("": ninguno)
            chatMobileVoiceEnabled: values.chatAssistantEnabled ? values.chatMobileVoiceEnabled === true : false,
            chatTelegramChatId: values.chatAssistantEnabled ? String(values.chatTelegramChatId ?? "").trim() : "",
            pipelineRequiresGpu: values.pipelineRequiresGpu,
            digitalTwinSimulationFormat: "{}",
            digitalTwinSimulationFormatFileName: "-",
            digitalTwinSimulationFormatLastModifDate: "-",
            sensorsRef: [],
            knowledgeDocuments,
        };

        setIsSubmitting(true);
        getAxiosInstance(refreshToken, authDispatch)
            .post(url, digitalTwinData, config)
            .then(async (response: AxiosResponse<any, any>) => {
                const data = response.data;
                toast.success(data.message);
                if (viewerData && viewerData.items.length > 0) {
                    toast.info("Loading the viewer data…");
                    await applyViewerData({ groupId, digitalTwinId: data.digitalTwinId }, viewerData.items, {
                        auth: { accessToken, refreshToken, authDispatch },
                        viewerSettings: null,
                        // a new twin: its automatic layout has one slide, whose 3D Model panel takes the model
                        slideId: "slide-1",
                    });
                }
                setIsSubmitting(false);
                setDigitalTwinsOptionToShow(digitalTwinsDispatch, { digitalTwinsOptionToShow: DIGITAL_TWINS_OPTIONS.TABLE });
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

    const validationSchema = Yup.object().shape({
        chatTelegramChatId: Yup.string().matches(/^\s*(-?\d{1,20})?\s*$/, "A Telegram chat id is a number (negative for groups)"),
        digitalTwinUid: Yup.string().length(20, "String must be 20 characters long").required("Required"),
        description: Yup.string().required("Required"),
    });

    const onCancel = (e: SyntheticEvent) => {
        e.preventDefault();
        backToTable();
    };

    const initialDigitalTwinData: IFormikValues = {
        orgAcronym: initOrg.acronym,
        groupAcronym: initGroup.acronym,
        assetName: initAssetName,
        description: "",
        digitalTwinUid,
        chatAssistantEnabled: false,
        pipelineRequiresGpu: false,
        chatAssistantLanguage: "en-UK-male",
        chatAssistantSecondLanguage: "none",
        chatAssistantVoiceLanguage: "question",
        chatMobileVoiceEnabled: false,
        chatTelegramChatId: "",
    };

    return (
        <>
            <FormTitle isSubmitting={isSubmitting}>Create digital twin</FormTitle>
            <DraggableFormContainer>
                <Formik initialValues={initialDigitalTwinData} validationSchema={validationSchema} onSubmit={onSubmit}>
                    {(formik) => {
                        const org = orgsOfGroupManaged.find((o) => o.acronym === formik.values.orgAcronym);
                        const group = groupsManaged.find((g) => g.acronym === formik.values.groupAcronym);
                        return (
                            // @ts-ignore
                            <Form>
                                <ControlsContainer>
                                    <FormikControl
                                        control="select"
                                        label="Select org"
                                        name="orgAcronym"
                                        type="text"
                                        options={orgOptions}
                                        onChange={(e) => handleChangeOrg(e, formik)}
                                    />
                                    <FormikControl
                                        control="select"
                                        label="Select group"
                                        name="groupAcronym"
                                        type="text"
                                        options={groupOptions}
                                        onChange={(e) => handleChangeGroup(e, formik)}
                                    />
                                    <FormikControl
                                        control="select"
                                        label="Select asset (by description)"
                                        name="assetName"
                                        type="text"
                                        options={assetNameOptions}
                                        onChange={(e: { value: string }) => formik.setFieldValue("assetName", e.value)}
                                    />
                                    <FieldContainer>
                                        <label>Asset name</label>
                                        <div>{formik.values.assetName}</div>
                                    </FieldContainer>
                                    <FormikControl control="input" label="DigitalTwinUid" name="digitalTwinUid" type="text" />
                                    <FormikControl control="input" label="Description" name="description" type="text" />
                                    <KnowledgeDocumentsSelector
                                        groupId={group ? group.id : null}
                                        ragEnabled={org?.ragEnabled === true && group?.ragEnabled === true}
                                        selected={knowledgeDocuments}
                                        onChange={setKnowledgeDocuments}
                                    />
                                    {orgLlmEnabled && groupLlmEnabled && (
                                        <ChatAssistantSection
                                            formik={formik}
                                            enabled={isChatAssistantEnabled}
                                            onEnabled={setIsChatAssistantEnabled}
                                        />
                                    )}
                                    {gpuUsageEnabledInOrg && gpuUsageEnabledInGroup && (
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
                                    <ViewerDataFileField value={viewerData} onChange={setViewerData} />
                                </ControlsContainer>
                                <FormButtonsProps onCancel={onCancel} isValid={formik.isValid} isSubmitting={formik.isSubmitting || isSubmitting} />
                            </Form>
                        );
                    }}
                </Formik>
            </DraggableFormContainer>
        </>
    );
};

// The chat assistant of a twin (create and edit forms)
export const ChatAssistantSection: FC<{
    formik: FormikProps<any>;
    enabled: boolean;
    onEnabled: (enabled: boolean) => void;
}> = ({ formik, enabled, onEnabled }) => (
    <FormSection title="Chat assistant">
        <Container>
            <FormikControl
                control="select"
                label="Use chat assistant"
                name="chatAssistantEnabled"
                options={chatAssistantEnabledOptions}
                type="text"
                onChange={(e: { value: boolean }) => {
                    formik.setFieldValue("chatAssistantEnabled", e.value);
                    onEnabled(e.value);
                }}
            />
            {enabled && (
                <>
                    <FormikControl
                        control="select"
                        label="Select chat assistant language"
                        name="chatAssistantLanguage"
                        options={CHAT_PRIMARY_LANGUAGE_OPTIONS}
                        type="text"
                        onChange={(e: { value: string }) => formik.setFieldValue("chatAssistantLanguage", e.value)}
                    />
                    <FormikControl
                        control="select"
                        label="Second language (bilingual chat)"
                        name="chatAssistantSecondLanguage"
                        options={CHAT_SECOND_LANGUAGE_OPTIONS}
                        type="text"
                        onChange={(e: { value: string }) => formik.setFieldValue("chatAssistantSecondLanguage", e.value)}
                    />
                    {isBilingualChat(formik.values.chatAssistantLanguage, formik.values.chatAssistantSecondLanguage) && (
                        <FormikControl
                            control="select"
                            label="Read the answers aloud in"
                            name="chatAssistantVoiceLanguage"
                            options={CHAT_VOICE_LANGUAGE_OPTIONS}
                            type="text"
                            onChange={(e: { value: string }) => formik.setFieldValue("chatAssistantVoiceLanguage", e.value)}
                        />
                    )}
                    <FormikControl
                        control="select"
                        label="Voice messages from the phone (Mobile audio)"
                        name="chatMobileVoiceEnabled"
                        options={chatChannelYesNoOptions}
                        type="text"
                        onChange={(e: { value: boolean }) => formik.setFieldValue("chatMobileVoiceEnabled", e.value)}
                    />
                    <FormikControl control="input" label="Telegram chat ID (empty: none)" name="chatTelegramChatId" type="text" />
                </>
            )}
        </Container>
    </FormSection>
);

export default CreateDigitalTwin;
