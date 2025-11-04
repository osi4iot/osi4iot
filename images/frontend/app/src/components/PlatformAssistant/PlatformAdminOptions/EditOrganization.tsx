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

const LlmTitle = styled.div`
    margin-bottom: 5px;
`;

const LlmDataContainer = styled.div`
    border: 2px solid #2c3235;
    border-radius: 10px;
    padding: 10px;
    width: 100%;
`;

const enableLLMOptions = [
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

    const initialOrgData = {
        name: organizations[orgRowIndex].name,
        acronym: organizations[orgRowIndex].acronym,
        buildingId: organizations[orgRowIndex].buildingId,
        role: organizations[orgRowIndex].role,
        mqttAccessControl: organizations[orgRowIndex].mqttAccessControl,
        llmEnabled: organizations[orgRowIndex].llmEnabled,
        llmProviderUrl: organizations[orgRowIndex].llmProviderUrl || "https://api.openai.com/v1",
        llmProviderApiKey: "*****************",
    };

    const validationSchema = Yup.object().shape({
        name: Yup.string().max(190, "The maximum number of characters allowed is 190").required("Required"),
        acronym: Yup.string().max(20, "The maximum number of characters allowed is 20").required("Required"),
        buildingId: Yup.number().integer().positive().required("Required"),
        llmProviderUrl: Yup.string().when("llmEnabled", {
            is: true,
            then: Yup.string().url("Enter a valid url").required("Required"),
        }),
        llmProviderApiKey: Yup.string().when("llmEnabled", {
            is: true,
            then: Yup.string().required("Required"),
        }),
    });

    const onSubmit = (values: {}, actions: any) => {
        const llmEnabled = (values as any).llmEnabled as boolean;
        const llmProviderApiKey = (values as any).llmProviderApiKey as string;
        if (llmEnabled && llmProviderApiKey === "*****************") {
           toast.error("Please provide a valid LLM provider api key");
           setIsSubmitting(false);
           return;
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

    return (
        <>
            <FormTitle isSubmitting={isSubmitting}>Edit org</FormTitle>
            <FormContainer>
                <Formik initialValues={initialOrgData} validationSchema={validationSchema} onSubmit={onSubmit}>
                    {(formik) => (
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
                                <LlmTitle>Large language model (LLM)</LlmTitle>
                                <LlmDataContainer>
                                    <FormikControl
                                        control="select"
                                        label="Enable LLM"
                                        name="llmEnabled"
                                        options={enableLLMOptions}
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
                                                control="input"
                                                label="LLM provider api key"
                                                name="llmProviderApiKey"
                                                type="password"
                                                autocomplete="off"
                                            />
                                        </>
                                    )}
                                </LlmDataContainer>
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
