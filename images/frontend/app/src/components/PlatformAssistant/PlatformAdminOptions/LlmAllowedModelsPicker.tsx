import { FC, useMemo, useState } from "react";
import styled from "styled-components";
import { AxiosError, AxiosResponse } from "axios";
import { useAuthState, useAuthDispatch } from "../../../contexts/authContext";
import { axiosAuth, getDomainName, getProtocol } from "../../../tools/tools";
import { getAxiosInstance } from "../../../tools/axiosIntance";
import axiosErrorHandler from "../../../tools/axiosErrorHandler";
import {
    ILlmModelList,
    formatAllowedModels,
    formatLlmModelLabel,
    parseAllowedModels,
} from "../Utils/llmProviders";

// Lets the platform admin pick the organization's allowed models from
// the list its provider offers, with the provider settings of the form
// (saved or not). admin_api asks the provider: when editing without a new
// API key, it uses the saved one, which never comes to the browser.

const domainName = getDomainName();
const protocol = getProtocol();

const Container = styled.div`
    margin: 5px 0 15px 0;
    color: white;
    font-size: 12px;
`;

const LoadButton = styled.button`
    background-color: #3274d9;
    color: white;
    border: none;
    border-radius: 5px;
    padding: 6px 10px;
    cursor: pointer;

    &:hover {
        background-color: #2461c0;
    }

    &:disabled {
        background-color: #2c3235;
        cursor: default;
    }
`;

const Hint = styled.div`
    color: #c9c9c9;
    margin: 6px 0;
`;

const ErrorText = styled.div`
    color: #f2495c;
    margin: 6px 0;
`;

const Filter = styled.input`
    width: 100%;
    box-sizing: border-box;
    margin: 6px 0;
    padding: 5px;
    background-color: #0c0d0f;
    color: white;
    border: 1px solid #2c3235;
    border-radius: 5px;
`;

const List = styled.div`
    max-height: 220px;
    overflow-y: auto;
    border: 1px solid #2c3235;
    border-radius: 5px;
    padding: 4px;
    background-color: #0c0d0f;
`;

const Row = styled.label`
    display: flex;
    align-items: flex-start;
    gap: 6px;
    padding: 2px 0;
    cursor: pointer;
    line-height: 1.3;

    & input {
        margin-top: 2px;
    }
`;

interface LlmAllowedModelsPickerProps {
    // The organization being edited (its saved API key is used when
    // apiKey is empty); none when creating one.
    orgId?: number;
    providerType: string;
    providerUrl: string;
    apiKey: string; // typed in the form; empty: the saved one
    value: string; // one model id per line
    onChange: (value: string) => void;
}

const LlmAllowedModelsPicker: FC<LlmAllowedModelsPickerProps> = ({
    orgId,
    providerType,
    providerUrl,
    apiKey,
    value,
    onChange,
}) => {
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();
    const [list, setList] = useState<ILlmModelList | null>(null);
    const [loading, setLoading] = useState(false);
    const [filter, setFilter] = useState("");

    const selected = useMemo(() => new Set(parseAllowedModels(value)), [value]);

    const load = () => {
        setLoading(true);
        const url = `${protocol}://${domainName}/admin_api/organization_llm_models_preview`;
        const body = {
            llmProviderType: providerType,
            llmProviderUrl: providerUrl,
            llmProviderApiKey: apiKey,
            orgId,
        };
        getAxiosInstance(refreshToken, authDispatch)
            .post(url, body, axiosAuth(accessToken))
            .then((response: AxiosResponse<ILlmModelList>) => setList(response.data))
            .catch((error: AxiosError) => axiosErrorHandler(error, authDispatch))
            .finally(() => setLoading(false));
    };

    const toggle = (id: string) => {
        const next = parseAllowedModels(value);
        const index = next.indexOf(id);
        if (index === -1) next.push(id);
        else next.splice(index, 1);
        onChange(formatAllowedModels(next));
    };

    const visible = (list?.models || []).filter((m) => {
        const f = filter.trim().toLowerCase();
        return f === "" || m.id.toLowerCase().includes(f) || (m.name || "").toLowerCase().includes(f);
    });

    return (
        <Container>
            <LoadButton type="button" onClick={load} disabled={loading}>
                {loading ? "Loading..." : list ? "Reload the provider's models" : "Choose from the provider's models"}
            </LoadButton>
            <Hint>Asks the provider with the type, url and api key above.</Hint>
            {list?.error && <ErrorText>The provider's models could not be listed: {list.error}</ErrorText>}
            {list && !list.error && !list.listed && <Hint>This provider gives no model list: type the ids.</Hint>}
            {list && list.models.length > 0 && (
                <>
                    <Filter
                        type="text"
                        placeholder={`Filter ${list.models.length} models...`}
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                    />
                    <List>
                        {visible.map((m) => (
                            <Row key={m.id}>
                                <input type="checkbox" checked={selected.has(m.id)} onChange={() => toggle(m.id)} />
                                <span>{formatLlmModelLabel(m)}</span>
                            </Row>
                        ))}
                    </List>
                    <Hint>{selected.size === 0 ? "None selected: all models allowed." : `${selected.size} selected.`}</Hint>
                </>
            )}
        </Container>
    );
};

export default LlmAllowedModelsPicker;
