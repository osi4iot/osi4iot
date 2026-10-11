import { FC, SyntheticEvent, useState } from "react";
import styled from "styled-components";
import { Formik, Form } from "formik";
import * as Yup from "yup";
import { useAuthState, useAuthDispatch } from "../../../contexts/authContext";
import { axiosAuth, getDomainName, getProtocol } from "../../../tools/tools";
import { toast } from "react-toastify";
import FormikControl from "../../Tools/FormikControl";
import FormButtonsProps from "../../Tools/FormButtons";
import FormTitle from "../../Tools/FormTitle";
import {
    useOrgsDispatch,
    useOrgRowIndexToEdit,
    setOrgsOptionToShow,
    useOrgIdToEdit,
} from "../../../contexts/orgsOptions";
import { ORGS_OPTIONS } from "../Utils/platformAssistantOptions";
import {
    setReloadGroupsMembershipTable,
    setReloadOrgsManagedTable,
    setReloadOrgsMembershipTable,
    usePlatformAssitantDispatch,
    setReloadGroupsTable,
    setReloadOrgsOfGroupsManagedTable,
} from "../../../contexts/platformAssistantContext";
import { getAxiosInstance } from "../../../tools/axiosIntance";
import axiosErrorHandler from "../../../tools/axiosErrorHandler";
import { AxiosResponse, AxiosError } from "axios";
import { IOrganization } from "../TableColumns/organizationsColumns";

const FormContainer = styled.div`
    font-size: 12px;
    padding: 30px 10px 30px 20px;
    border: 3px solid #3274d9;
    border-radius: 20px;
    width: 400px;
    height: calc(100vh - 310px);
`;

const ControlsContainer = styled.div`
    height: calc(100vh - 430px);
    width: 100%;
    padding: 0px 5px;
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

const Title = styled.div`
    margin-bottom: 5px;
`;

const DataContainer = styled.div`
    border: 2px solid #2c3235;
    border-radius: 10px;
    padding: 10px;
    width: 100%;
    margin-bottom: 15px;
`;

const enableDisableOptions = [
    {
        label: "Enabled",
        value: true,
    },
    {
        label: "Disabled",
        value: false,
    },
];

const domainName = getDomainName();
const protocol = getProtocol();

interface EditOrganizationProps {
    organizations: IOrganization[];
    refreshOrgs: () => void;
    backToTable: () => void;
}

const roleOptions = [
    { label: "Generic", value: "Generic" },
    { label: "Provider", value: "Provider" },
];

const EditOrganization: FC<EditOrganizationProps> = ({ organizations, refreshOrgs, backToTable }) => {
    const plaformAssistantDispatch = usePlatformAssitantDispatch();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const orgsDispatch = useOrgsDispatch();
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();
    const orgRowIndex = useOrgRowIndexToEdit();
    const orgId = useOrgIdToEdit();
    const [llmEnabled, setLlmEnabled] = useState(organizations[orgRowIndex].llmEnabled);
    const [changeLlmProviderApiKey, setChangeLlmProviderApiKey] = useState(false);
    const [telegramEnabled, setTelegramEnabled] = useState(organizations[orgRowIndex].telegramEnabled);
    const [changeTelegramSettings, setChangeTelegramSettings] = useState(false);
    const changeTelegramSettingsOptions = [
        { label: "Yes", value: true },
        { label: "No", value: false },
    ];
    const changeLlmProviderApiKeyOptions = [
        { label: "Yes", value: true },
        { label: "No", value: false },
    ];

    const initialOrgData = {
        name: organizations[orgRowIndex].name,
        acronym: organizations[orgRowIndex].acronym,
        buildingId: organizations[orgRowIndex].buildingId,
        role: organizations[orgRowIndex].role,
        mqttAccessControl: organizations[orgRowIndex].mqttAccessControl,
        llmEnabled: organizations[orgRowIndex].llmEnabled,
        llmProviderUrl: organizations[orgRowIndex].llmProviderUrl || "https://api.openai.com/v1",
        changeLlmProviderApiKey: false,
        llmProviderApiKey: "",
        telegramEnabled: organizations[orgRowIndex].telegramEnabled || false,
        changeTelegramSettings: false,
        telegramBotToken: "",
    };

    const validationSchema = Yup.object().shape({
        name: Yup.string().max(190, "The maximum number of characters allowed is 190").required("Required"),
        acronym: Yup.string().max(20, "The maximum number of characters allowed is 20").required("Required"),
        buildingId: Yup.number().integer().positive().required("Required"),

        llmProviderUrl: Yup.string().when("llmEnabled", {
            is: true,
            then: (schema) => schema.url("Enter a valid url").required("Required"),
            otherwise: (schema) => schema.notRequired(),
        }),

        llmProviderApiKey: Yup.string().when(["llmEnabled", "changeLlmProviderApiKey"], {
            is: (llmEnabled: boolean, changeLlmProviderApiKey: boolean) => llmEnabled && changeLlmProviderApiKey,
            then: (schema) => schema.required("Required"),
            otherwise: (schema) => schema.notRequired(),
        }),

        telegramBotToken: Yup.string().when(["telegramEnabled", "changeTelegramSettings"], {
            is: (telegramEnabled: boolean, changeTelegramSettings: boolean) =>
                telegramEnabled && changeTelegramSettings,
            then: (schema) => schema.required("Required"),
            otherwise: (schema) => schema.notRequired(),
        }),
    });

    const onSubmit = (values: {}, actions: any) => {
        const llmEnabled = (values as any).llmEnabled as boolean;
        const changeLlmProviderApiKey = (values as any).changeLlmProviderApiKey as boolean;
        const llmProviderApiKey = (values as any).llmProviderApiKey as string;
        if (llmEnabled && changeLlmProviderApiKey) {
            if (llmProviderApiKey === "-") {
                toast.error("Please provide a valid LLM provider api key");
                setIsSubmitting(false);
                return;
            }
        }

        const telegramEnabled = (values as any).telegramEnabled as boolean;
        const changeTelegramSettings = (values as any).changeTelegramSettings as boolean;
        const telegramBotToken = (values as any).telegramBotToken as string;
        if (telegramEnabled && changeTelegramSettings) {
            if (telegramBotToken === "-") {
                toast.error("Please provide a valid Telegram bot token");
                setIsSubmitting(false);
                return;
            }
        }

        const url = `${protocol}://${domainName}/admin_api/organization/id/${orgId}`;
        const config = axiosAuth(accessToken);

        if (typeof (values as any).buildingId === "string") {
            (values as any).buildingId = parseInt((values as any).buildingId, 10);
        }

        setIsSubmitting(true);
        getAxiosInstance(refreshToken, authDispatch)
            .patch(url, values, config)
            .then((response: AxiosResponse<any, any>) => {
                const data = response.data;
                toast.success(data.message);
                const orgsOptionToShow = { orgsOptionToShow: ORGS_OPTIONS.TABLE };
                setIsSubmitting(false);
                setOrgsOptionToShow(orgsDispatch, orgsOptionToShow);
            })
            .catch((error: AxiosError) => {
                axiosErrorHandler(error, authDispatch);
                backToTable();
            })
            .finally(() => {
                refreshOrgs();
                const reloadOrgsManagedTable = true;
                setReloadOrgsManagedTable(plaformAssistantDispatch, { reloadOrgsManagedTable });
                const reloadOrgsMembershipTable = true;
                setReloadOrgsMembershipTable(plaformAssistantDispatch, { reloadOrgsMembershipTable });
                const reloadGroupsTable = true;
                setReloadGroupsTable(plaformAssistantDispatch, { reloadGroupsTable });
                const reloadGroupsMembershipTable = true;
                setReloadGroupsMembershipTable(plaformAssistantDispatch, { reloadGroupsMembershipTable });
                const reloadOrgsOfGroupsManagedTable = true;
                setReloadOrgsOfGroupsManagedTable(plaformAssistantDispatch, { reloadOrgsOfGroupsManagedTable });
            });
    };

    const onCancel = (e: SyntheticEvent) => {
        e.preventDefault();
        backToTable();
    };

    const onEnableLLMChange = (e: { value: boolean }, formik: any) => {
        setLlmEnabled(e.value);
        formik.setFieldValue("llmEnabled", e.value);
    };

    const onEnableTelegramChange = (e: { value: boolean }, formik: any) => {
        setTelegramEnabled(e.value);
        formik.setFieldValue("telegramEnabled", e.value);
        if (e.value === true) {
            setChangeTelegramSettings(true);
            formik.setFieldValue("changeTelegramSettings", true);
            formik.setFieldValue("telegramBotToken", "");
        }
    };

    const onChangeTelegramSettingsChange = (e: { value: boolean }, formik: any) => {
        setChangeTelegramSettings(e.value);
        formik.setFieldValue("changeTelegramSettings", e.value);
    };

    const onChangeLlmProviderApiKeyChange = (e: { value: boolean }, formik: any) => {
        setChangeLlmProviderApiKey(e.value);
        formik.setFieldValue("changeLlmProviderApiKey", e.value);
    };

    return (
        <>
            <FormTitle isSubmitting={isSubmitting}>Edit org</FormTitle>
            <FormContainer>
                <Formik initialValues={initialOrgData} validationSchema={validationSchema} onSubmit={onSubmit}>
                    {(formik) => (
                        // @ts-ignore
                        <Form>
                            <ControlsContainer>
                                <FormikControl control="input" label="Org name" name="name" type="text" />
                                <FormikControl control="input" label="Org acronym" name="acronym" type="text" />
                                <FormikControl
                                    control="input"
                                    label="Role"
                                    name="role"
                                    type="select"
                                    options={roleOptions}
                                />
                                <FormikControl control="input" label="Building Id" name="buildingId" type="text" />
                                <FormikControl
                                    control="select"
                                    label="Mqtt access control"
                                    name="mqttAccessControl"
                                    options={mqttAccessControlOptions}
                                    type="text"
                                />
                                <Title>Telegram bot</Title>
                                <DataContainer>
                                    <FormikControl
                                        control="select"
                                        label="Enable Telegram"
                                        name="telegramEnabled"
                                        options={enableDisableOptions}
                                        type="text"
                                        onChange={(e) => onEnableTelegramChange(e, formik)}
                                    />
                                    {telegramEnabled && (
                                        <FormikControl
                                            control="select"
                                            label="Change settings"
                                            name="changeTelegramSettings"
                                            options={changeTelegramSettingsOptions}
                                            type="text"
                                            onChange={(e) => onChangeTelegramSettingsChange(e, formik)}
                                        />
                                    )}
                                    {telegramEnabled && changeTelegramSettings && (
                                        <FormikControl
                                            control="input"
                                            label="Telegram bot token"
                                            name="telegramBotToken"
                                            type="password"
                                            autocomplete="off"
                                        />
                                    )}
                                </DataContainer>
                                <Title>Large language model (LLM)</Title>
                                <DataContainer>
                                    <FormikControl
                                        control="select"
                                        label="Enable LLM"
                                        name="llmEnabled"
                                        options={enableDisableOptions}
                                        type="text"
                                        onChange={(e) => onEnableLLMChange(e, formik)}
                                    />
                                    {llmEnabled && (
                                        <>
                                            <FormikControl
                                                control="input"
                                                label="LLM provider url"
                                                name="llmProviderUrl"
                                                type="text"
                                            />
                                            <FormikControl
                                                control="select"
                                                label="Change LLM provider api key"
                                                name="changeLlmProviderApiKey"
                                                options={changeLlmProviderApiKeyOptions}
                                                type="text"
                                                onChange={(e) => onChangeLlmProviderApiKeyChange(e, formik)}
                                            />
                                            {changeLlmProviderApiKey && (
                                                <FormikControl
                                                    control="input"
                                                    label="LLM provider api key"
                                                    name="llmProviderApiKey"
                                                    type="password"
                                                    autocomplete="off"
                                                />
                                            )}
                                        </>
                                    )}
                                </DataContainer>
                            </ControlsContainer>
                            <FormButtonsProps
                                onCancel={onCancel}
                                isValid={formik.isValid}
                                isSubmitting={formik.isSubmitting}
                            />
                        </Form>
                    )}
                </Formik>
            </FormContainer>
        </>
    );
};

export default EditOrganization;
