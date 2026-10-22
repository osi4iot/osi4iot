import { FC, useCallback, useEffect, useMemo, useState } from "react";
import styled from "styled-components";
import { AxiosError, AxiosResponse } from "axios";
import { RefreshCw } from "lucide-react";
import { useAuthState, useAuthDispatch } from "../../../../contexts/authContext";
import { axiosAuth, getDomainName, getProtocol } from "../../../../tools/tools";
import { getAxiosInstance } from "../../../../tools/axiosIntance";
import { ILlmModelInfo, ILlmModelList, formatLlmModelLabel } from "../../Utils/llmProviders";
import { Input, Select } from "./types";

// The LLM model of an AI node, chosen from the models the group's
// organization may use: its allowed models, or everything its provider
// offers (admin_api asks the provider; the key never reaches the
// browser). When the provider gives no list the id is typed.
//
// The node stores the bare id ("anthropic/claude-sonnet-4.5" on
// OpenRouter); pipelines adds the organization's provider type. Models
// stored before as "openai:gpt-4o" still work and are shown as they are.

const domainName = getDomainName();
const protocol = getProtocol();

const Row = styled.div`
    display: flex;
    align-items: center;
    gap: 6px;
`;

const RefreshButton = styled.button`
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: 1px solid #2c3235;
    border-radius: 4px;
    color: #c9c9c9;
    padding: 4px;
    cursor: pointer;

    &:hover {
        color: white;
        border-color: #3274d9;
    }

    &:disabled {
        cursor: default;
        opacity: 0.5;
    }
`;

const Hint = styled.div`
    color: #9a9a9a;
    font-size: 11px;
    margin-top: 4px;
`;

const ErrorHint = styled(Hint)`
    color: #f2495c;
`;

const LEGACY_PREFIXES = ["openai", "anthropic", "google", "gemini", "ollama", "azure", "deepseek"];

// "openai:gpt-4o" (stored before) -> "gpt-4o".
const stripLegacyPrefix = (model: string): string => {
    const i = model.indexOf(":");
    return i > 0 && LEGACY_PREFIXES.includes(model.slice(0, i).toLowerCase()) ? model.slice(i + 1) : model;
};

// One list per group while the editor is open.
const listCache = new Map<number, ILlmModelList>();

interface LlmModelSelectProps {
    groupId: number;
    value: string;
    onChange: (model: string) => void;
}

const LlmModelSelect: FC<LlmModelSelectProps> = ({ groupId, value, onChange }) => {
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();
    const [list, setList] = useState<ILlmModelList | null>(listCache.get(groupId) || null);
    const [loading, setLoading] = useState(false);
    const [filter, setFilter] = useState("");

    const load = useCallback(
        (refresh: boolean) => {
            setLoading(true);
            const url = `${protocol}://${domainName}/admin_api/group_llm_models/${groupId}${refresh ? "?refresh=true" : ""}`;
            getAxiosInstance(refreshToken, authDispatch)
                .get(url, axiosAuth(accessToken))
                .then((response: AxiosResponse<ILlmModelList>) => {
                    listCache.set(groupId, response.data);
                    setList(response.data);
                })
                .catch((error: AxiosError) => {
                    const message = (error.response?.data as { message?: string })?.message || error.message;
                    setList({ providerType: "", listed: false, error: message, models: [] });
                })
                .finally(() => setLoading(false));
        },
        [accessToken, refreshToken, authDispatch, groupId],
    );

    useEffect(() => {
        if (!listCache.has(groupId)) load(false);
    }, [groupId, load]);

    // A model stored as "openai:gpt-4o" is the list's "gpt-4o", or
    // "openai/gpt-4o" on OpenRouter (pipelines does the same).
    const current = useMemo(() => {
        const ids = new Set((list?.models || []).map((m) => m.id));
        if (!value || ids.has(value)) return value;
        const stripped = stripLegacyPrefix(value);
        if (ids.has(stripped)) return stripped;
        if (value.startsWith("openai:") && ids.has(`openai/${stripped}`)) return `openai/${stripped}`;
        return value;
    }, [list, value]);

    const models: ILlmModelInfo[] = useMemo(() => {
        const all = list?.models || [];
        const f = filter.trim().toLowerCase();
        const shown = f === "" ? all : all.filter((m) => m.id.toLowerCase().includes(f) || m.name.toLowerCase().includes(f));
        // The node's model always shows, even when the list does not
        // have it (a model stored before, or one no longer allowed).
        if (current && !shown.some((m) => m.id === current)) {
            return [{ id: current, name: current, supportsTools: null }, ...shown];
        }
        return shown;
    }, [list, filter, current]);

    const listed = !!list && list.listed && (list.models.length > 0 || !list.error);
    const valueInList = !!list && list.models.some((m) => m.id === current);

    if (!listed) {
        return (
            <>
                <Row>
                    <Input
                        type="text"
                        value={value}
                        placeholder="Model id, e.g. anthropic/claude-sonnet-4.5"
                        onChange={(e: { target: { value: string } }) => onChange(e.target.value.trim())}
                    />
                    <RefreshButton type="button" title="Load the models again" onClick={() => load(true)} disabled={loading}>
                        <RefreshCw size={14} />
                    </RefreshButton>
                </Row>
                {loading && <Hint>Loading the models...</Hint>}
                {list?.error && <ErrorHint>The models could not be listed: {list.error}</ErrorHint>}
            </>
        );
    }

    return (
        <>
            {(list?.models.length || 0) > 15 && (
                <Input
                    type="text"
                    value={filter}
                    placeholder={`Filter ${list?.models.length} models...`}
                    onChange={(e: { target: { value: string } }) => setFilter(e.target.value)}
                    style={{ marginBottom: "4px" }}
                />
            )}
            <Row>
                <Select value={current} onChange={(e: { target: { value: string } }) => onChange(e.target.value)}>
                    {!current && <option value="">Select a model...</option>}
                    {models.map((m) => (
                        <option key={m.id} value={m.id}>
                            {m.id === current && !valueInList ? `${m.id} (not in the list)` : formatLlmModelLabel(m)}
                        </option>
                    ))}
                </Select>
                <RefreshButton type="button" title="Load the models again" onClick={() => load(true)} disabled={loading}>
                    <RefreshCw size={14} />
                </RefreshButton>
            </Row>
            {current && !valueInList && (
                <Hint>This model is not among the organization's models: choose one from the list.</Hint>
            )}
        </>
    );
};

export default LlmModelSelect;
