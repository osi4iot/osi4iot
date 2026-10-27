import { FC, useState, SyntheticEvent } from "react";
import { reloadTable } from "../../../state";
import styled from "styled-components";
import { Formik, Form } from "formik";
import * as Yup from "yup";
import { useAuthState, useAuthDispatch } from "../../../contexts/authContext";
import { axiosAuth, getDomainName, getProtocol } from "../../../tools/tools";
import { toast } from "react-toastify";
import FormikControl from "../../Tools/FormikControl";
import FormButtonsProps from "../../Tools/FormButtons";
import FormTitle from "../../Tools/FormTitle";
import { setOrgsOptionToShow, useOrgsDispatch } from "../../../contexts/orgsOptions";
import { ORGS_OPTIONS } from "../Utils/platformAssistantOptions";
import { ISelectGlobalUser } from "../TableColumns/selectGlobalUserColumns";
import SelectGlobalUsers from "./SelectGlobalUsers";
import { IOrgInputData } from "./OrgContainer";
import {
    LLM_PROVIDER_DEFAULT_URLS,
    LLM_PROVIDER_TYPE_OPTIONS,
    isDefaultLlmProviderUrl,
    parseAllowedModels,
} from "../Utils/llmProviders";
import LlmAllowedModelsPicker from "./LlmAllowedModelsPicker";
import { getAxiosInstance } from "../../../tools/axiosIntance";
import axiosErrorHandler from "../../../tools/axiosErrorHandler";
import { AxiosResponse, AxiosError } from "axios";
import { FormCard as FormContainer, ControlsContainer, FormSection } from "../../Tools/FormTools";

const roleOptions = [
    { label: "Generic", value: "Generic" },
    { label: "Provider", value: "Provider" },
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

interface CreateOrganizationProps {
    backToTable: () => void;
    refreshOrgs: () => void;
    orgInputData: IOrgInputData;
    setOrgInputData: (orgInputData: IOrgInputData) => void;
}

const CreateOrganization: FC<CreateOrganizationProps> = ({
    backToTable,
    refreshOrgs,
    orgInputData,
    setOrgInputData,
}) => {
    const [showCreateOrg, setShowCreateOrg] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [selectedUsersArray, setSelectedUsersArray] = useState<ISelectGlobalUser[]>([]);
    const { accessToken, refreshToken } = useAuthState();
    const [llmEnabled, setLlmEnabled] = useState(false);
    const [telegramEnabled, setTelegramEnabled] = useState(false);
    const authDispatch = useAuthDispatch();
    const orgsDispatch = useOrgsDispatch();
    // The form's values: the organization data plus the LLM provider
    // fields, typed here so the form does not depend on IOrgInputData
    // declaring them.
    const initialOrgData: IOrgInputData & {
        llmProviderType?: string;
        llmProviderUrl?: string;
        llmProviderApiKey?: string;
        llmAllowedModelsText?: string;
    } = { ...orgInputData };
    if (selectedUsersArray.length !== 0) {
        const newOrgAdmins = selectedUsersArray.map((user) => {
            const orgAdminData = {
                firstName: user.firstName,
                surname: user.surname,
                email: user.email,
                login: "",
                password: "",
            };
            return orgAdminData;
        });
        const lastOrgAdmin = initialOrgData.orgAdminArray[initialOrgData.orgAdminArray.length - 1];
        if (Object.values(lastOrgAdmin).filter((value) => value !== "").length === 0) {
            initialOrgData.orgAdminArray = [...initialOrgData.orgAdminArray.slice(0, -1), ...newOrgAdmins];
        } else {
            initialOrgData.orgAdminArray = [...initialOrgData.orgAdminArray, ...newOrgAdmins];
        }
    }

    const validationSchema = Yup.object().shape({
        name: Yup.string().max(190, "The maximum number of characters allowed is 190").required("Required"),
        acronym: Yup.string().max(20, "The maximum number of characters allowed is 20").required("Required"),
        buildingId: Yup.number().positive().integer().required("Required"),
        llmProviderUrl: Yup.string().when("llmEnabled", {
            is: true,
            then: (schema) => schema.url("Enter a valid url").required("Required"),
        }),
        llmProviderApiKey: Yup.string().when("llmEnabled", {
            is: true,
            then: (schema) => schema.required("Required"),
        }),
        telegramBotToken: Yup.string().when("telegramEnabled", {
            is: true,
            then: (schema) => schema.required("Required"),
        }),
        orgAdminArray: Yup.array()
            .of(
                Yup.object().shape({
                    firstName: Yup.string()
                        .max(127, "The maximum number of characters allowed is 127")
                        .required("Required"),
                    surname: Yup.string()
                        .max(127, "The maximum number of characters allowed is 127")
                        .required("Required"),
                    email: Yup.string()
                        .email("Enter a valid email")
                        .max(190, "The maximum number of characters allowed is 190")
                        .required("Required"),
                    login: Yup.string()
                        .matches(
                            /^[a-zA-Z0-9._-]{4,}$/,
                            "Only the following characters are allowed for username: a-zA-Z0-9._-",
                        )
                        .min(4, "The minimum number of characters allowed is 4")
                        .max(190, "The maximum number of characters allowed is 190"),
                    password: Yup.string()
                        .matches(
                            /^[a-zA-Z0-9._-]{8,20}$/,
                            "Only the following characters are allowed for username: a-zA-Z0-9._-",
                        )
                        .min(4, "The minimum number of characters allowed is 8")
                        .max(20, "The maximum number of characters allowed is 20"),
                }),
            )
            .required("Must have org admin") // these constraints are shown if and only if inner constraints are satisfied
            .min(1, "Must be at least one org amdin"),
    });

    const onSubmit = (values: {}, actions: any) => {
        const url = `${protocol}://${domainName}/admin_api/organization`;
        const config = axiosAuth(accessToken);

        if (typeof (values as any).buildingId === "string") {
            (values as any).buildingId = parseInt((values as any).buildingId, 10);
        }

        // The allowed models are edited as text, one id per line.
        const { llmAllowedModelsText, ...orgData } = values as any;
        orgData.llmAllowedModels = parseAllowedModels(llmAllowedModelsText);

        setIsSubmitting(true);
        getAxiosInstance(refreshToken, authDispatch)
            .post(url, orgData, config)
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
                reloadTable("orgsManaged");
                reloadTable("orgUsers");
                reloadTable("orgsMembership");
                reloadTable("groups");
                reloadTable("groupsMembership");
                reloadTable("groupsManaged");

                reloadTable("orgsOfGroupsManaged");
                reloadTable("groupMembers");
                reloadTable("assetTypes");
                reloadTable("assets");
                reloadTable("sensorTypes");
                reloadTable("sensors");
                reloadTable("topics");
                reloadTable("digitalTwins");
                reloadTable("dashboards");
            });
    };

    const onCancel = (e: SyntheticEvent) => {
        e.preventDefault();
        backToTable();
    };

    const goToSelect = (orgInputData: IOrgInputData) => {
        setOrgInputData(orgInputData);
        setShowCreateOrg(false);
    };

    // A new provider type brings its usual URL, unless one was typed.
    const onLlmProviderTypeChange = (e: { value: string }, formik: any) => {
        formik.setFieldValue("llmProviderType", e.value);
        if (isDefaultLlmProviderUrl(formik.values.llmProviderUrl)) {
            formik.setFieldValue("llmProviderUrl", LLM_PROVIDER_DEFAULT_URLS[e.value] || "");
        }
    };

    const onEnableLLMChange = (e: { value: boolean }, formik: any) => {
        setLlmEnabled(e.value);
        formik.setFieldValue("llmEnabled", e.value);
    };

    const onEnableGpuUsageChange = (e: { value: boolean }, formik: any) => {
        formik.setFieldValue("gpuUsageEnabled", e.value);
    };

    const onEnableTelegramChange = (e: { value: boolean }, formik: any) => {
        setTelegramEnabled(e.value);
        formik.setFieldValue("telegramEnabled", e.value);
    };

    return (
        <>
            {showCreateOrg ? (
                <>
                    <FormTitle isSubmitting={isSubmitting}>Create org</FormTitle>
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
                                        <FormikControl
                                            control="input"
                                            label="Building Id"
                                            name="buildingId"
                                            type="text"
                                        />
                                        <FormikControl
                                            control="select"
                                            label="Mqtt access control"
                                            name="mqttAccessControl"
                                            options={mqttAccessControlOptions}
                                            type="text"
                                        />
                                        <FormikControl
                                            control="select"
                                            label="Enable GPU usage"
                                            name="gpuUsageEnabled"
                                            options={enableDisableOptions}
                                            type="text"
                                            onChange={(e) => onEnableGpuUsageChange(e, formik)}
                                        />
                                        <FormikControl
                                            control="select"
                                            label="Enable knowledge base (RAG)"
                                            name="ragEnabled"
                                            options={enableDisableOptions}
                                            type="text"
                                            onChange={(e) => formik.setFieldValue("ragEnabled", e.value)}
                                        />
                                        <FormSection title="Telegram bot">
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
                                                    control="input"
                                                    label="Telegram bot token"
                                                    name="telegramBotToken"
                                                    type="password"
                                                    autocomplete="off"
                                                />
                                            )}
                                        </DataContainer>
                                        </FormSection>
                                        <FormSection title="Large language model (LLM)">
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
                                                        control="select"
                                                        label="LLM provider type"
                                                        name="llmProviderType"
                                                        options={LLM_PROVIDER_TYPE_OPTIONS}
                                                        type="text"
                                                        onChange={(e) => onLlmProviderTypeChange(e, formik)}
                                                    />
                                                    <FormikControl
                                                        control="input"
                                                        label="LLM provider url"
                                                        name="llmProviderUrl"
                                                        type="text"
                                                    />
                                                    <FormikControl
                                                        control="input"
                                                        label="LLM provider api key"
                                                        name="llmProviderApiKey"
                                                        type="password"
                                                        autocomplete="off"
                                                    />
                                                    <FormikControl
                                                        control="textarea"
                                                        label="Allowed models (one id per line; empty: all the provider offers)"
                                                        name="llmAllowedModelsText"
                                                        type="text"
                                                    />
                                                    <LlmAllowedModelsPicker
                                                        providerType={formik.values.llmProviderType || ""}
                                                        providerUrl={formik.values.llmProviderUrl || ""}
                                                        apiKey={formik.values.llmProviderApiKey || ""}
                                                        value={formik.values.llmAllowedModelsText || ""}
                                                        onChange={(text) => formik.setFieldValue("llmAllowedModelsText", text)}
                                                    />
                                                </>
                                            )}
                                        </DataContainer>
                                        </FormSection>
                                        <FormikControl
                                            control="inputArray"
                                            label="Organization admins"
                                            name="orgAdminArray"
                                            labelArray={[
                                                "First name *",
                                                "Surname *",
                                                "Email *",
                                                "Username",
                                                "Password",
                                            ]}
                                            nameArray={["firstName", "surname", "email", "login", "password"]}
                                            typeArray={["text", "text", "email", "text", "password"]}
                                            addLabel="org admin"
                                            selectLabel="user"
                                            goToSelect={() => goToSelect(formik.values)}
                                        />
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
            ) : (
                <SelectGlobalUsers
                    backToCreate={() => setShowCreateOrg(true)}
                    setSelectedUsersArray={(selectedUsers: ISelectGlobalUser[]) => setSelectedUsersArray(selectedUsers)}
                />
            )}
        </>
    );
};

export default CreateOrganization;
