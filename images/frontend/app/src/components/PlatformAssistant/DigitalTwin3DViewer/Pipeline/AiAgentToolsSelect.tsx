import { FC, useCallback, useEffect, useMemo, useState } from "react";
import styled from "styled-components";
import { AxiosError, AxiosResponse } from "axios";
import { RefreshCw } from "lucide-react";
import { useAuthState, useAuthDispatch } from "../../../../contexts/authContext";
import { axiosAuth } from "../../../../tools/tools";
import { getAxiosInstance } from "../../../../tools/axiosIntance";
import { IMcpServerInfo, ISkillSummary, groupAvailableSkillsUrl } from "../../Utils/skills";
import { CheckboxInput, Label } from "./types";

// The tools of an AiAgent node's agent:
//   - "mcpServers": the MCP servers. A node without the setting has all
//     of them (as before it existed); the first change stores the list.
//   - "skills": ["platform:<name>", "group:<name>"], none by default.
//     The agent knows a skill by its name, so two with the same name
//     cannot both be chosen.

const Section = styled.div`
    margin-bottom: 18px;
`;

const SectionHeader = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
`;

const SubTitle = styled.div`
    color: #9ca3af;
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    margin: 10px 0 6px 0;
`;

const Item = styled.label<{ disabled?: boolean }>`
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 8px 10px;
    margin-bottom: 6px;
    border-radius: 6px;
    background-color: #374151;
    border: 1px solid #4b5563;
    color: #d1d5db;
    font-size: 13px;
    cursor: ${(p) => (p.disabled ? "default" : "pointer")};
    opacity: ${(p) => (p.disabled ? 0.55 : 1)};

    & > input {
        margin-top: 2px;
        flex-shrink: 0;
    }
`;

const ItemText = styled.div`
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
`;

const ItemName = styled.span`
    color: #f9fafb;
    font-weight: 600;
    word-break: break-word;
`;

const ItemDescription = styled.span`
    color: #c9c9c9;
    white-space: normal;
`;

const Hint = styled.div`
    color: #9a9a9a;
    font-size: 11px;
    margin: 2px 0 2px;
`;

const Warning = styled.div`
    color: #f2cc0c;
    font-size: 12px;
`;

const ErrorHint = styled(Hint)`
    color: #f2495c;
`;

const RefreshButton = styled.button`
    display: flex;
    align-items: center;
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
`;

interface IAvailable {
    skills: ISkillSummary[];
    mcpServers: IMcpServerInfo[];
}

// One list per group while the editor is open.
const cache = new Map<number, IAvailable>();

interface AiAgentToolsSelectProps {
    groupId: number;
    mcpServers: string[] | undefined;
    skills: string[];
    onChangeMcpServers: (servers: string[]) => void;
    onChangeSkills: (skills: string[]) => void;
}

const AiAgentToolsSelect: FC<AiAgentToolsSelectProps> = ({
    groupId,
    mcpServers,
    skills,
    onChangeMcpServers,
    onChangeSkills,
}) => {
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();
    const [available, setAvailable] = useState<IAvailable | null>(cache.get(groupId) || null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const load = useCallback(() => {
        setLoading(true);
        setError("");
        getAxiosInstance(refreshToken, authDispatch)
            .get(groupAvailableSkillsUrl(groupId), axiosAuth(accessToken))
            .then((response: AxiosResponse<IAvailable>) => {
                cache.set(groupId, response.data);
                setAvailable(response.data);
            })
            .catch((e: AxiosError) => {
                setError((e.response?.data as { message?: string })?.message || e.message);
            })
            .finally(() => setLoading(false));
    }, [accessToken, refreshToken, authDispatch, groupId]);

    useEffect(() => {
        if (!cache.has(groupId)) load();
    }, [groupId, load]);

    const servers = available?.mcpServers || [];
    const allServers = servers.map((s) => s.name);
    // No setting: every server.
    const chosenServers = mcpServers ?? allServers;

    const toggleServer = (name: string, checked: boolean) => {
        const next = checked ? [...chosenServers, name] : chosenServers.filter((s) => s !== name);
        onChangeMcpServers(allServers.filter((s) => next.includes(s)));
    };

    const skillByRef = useMemo(() => new Map((available?.skills || []).map((s) => [s.ref, s])), [available]);
    const chosenNames = useMemo(
        () => new Map(skills.map((ref) => [skillByRef.get(ref)?.name ?? ref.split(":")[1], ref])),
        [skills, skillByRef],
    );

    const toggleSkill = (ref: string, checked: boolean) =>
        onChangeSkills(checked ? [...skills, ref] : skills.filter((r) => r !== ref));

    // Chosen skills that are no longer there (deleted): shown to remove them.
    const missing = available ? skills.filter((ref) => !skillByRef.has(ref)) : [];

    const renderSkill = (skill: ISkillSummary) => {
        const checked = skills.includes(skill.ref);
        const clash = !checked && chosenNames.has(skill.name) && chosenNames.get(skill.name) !== skill.ref;
        const needs = checked ? skill.requiresMcp.filter((s) => !chosenServers.includes(s)) : [];
        return (
            <Item key={skill.ref} disabled={clash || !!skill.error}>
                <CheckboxInput
                    type="checkbox"
                    checked={checked}
                    disabled={!checked && (clash || !!skill.error)}
                    onChange={(e: { target: { checked: boolean } }) => toggleSkill(skill.ref, e.target.checked)}
                />
                <ItemText>
                    <ItemName>
                        {skill.name}
                        {skill.version && ` (v${skill.version})`}
                        {skill.builtin && " · built-in"}
                    </ItemName>
                    <ItemDescription>{skill.description}</ItemDescription>
                    {clash && <Hint>Another chosen skill has this name.</Hint>}
                    {skill.error && <ErrorHint>{skill.error}</ErrorHint>}
                    {needs.length > 0 && <Warning>Needs the MCP server(s): {needs.join(", ")}</Warning>}
                </ItemText>
            </Item>
        );
    };

    const platformSkills = (available?.skills || []).filter((s) => s.scope === "platform");
    const groupSkills = (available?.skills || []).filter((s) => s.scope === "group");

    return (
        <>
            <Section>
                <SectionHeader>
                    <Label>MCP servers</Label>
                    <RefreshButton type="button" title="Load the lists again" onClick={load} disabled={loading}>
                        <RefreshCw size={14} />
                    </RefreshButton>
                </SectionHeader>
                {loading && <Hint>Loading…</Hint>}
                {error && <ErrorHint>The lists could not be loaded: {error}</ErrorHint>}
                {mcpServers === undefined && servers.length > 0 && (
                    <Hint>All the servers (the default). The tools are named &lt;server&gt;__&lt;tool&gt;.</Hint>
                )}
                {servers.map((server) => (
                    <Item key={server.name}>
                        <CheckboxInput
                            type="checkbox"
                            checked={chosenServers.includes(server.name)}
                            onChange={(e: { target: { checked: boolean } }) =>
                                toggleServer(server.name, e.target.checked)
                            }
                        />
                        <ItemText>
                            <ItemName>
                                {server.label} ({server.name})
                            </ItemName>
                            <ItemDescription>{server.description}</ItemDescription>
                            {server.condition && <Hint>{server.condition}</Hint>}
                        </ItemText>
                    </Item>
                ))}
            </Section>
            <Section>
                <Label>Skills</Label>
                <Hint>
                    The agent sees each chosen skill's name and description, and loads its instructions when it needs
                    them. Skills are managed in Platform admin and Group admin → Skills.
                </Hint>
                {missing.length > 0 && (
                    <>
                        <SubTitle>Not found</SubTitle>
                        {missing.map((ref) => (
                            <Item key={ref}>
                                <CheckboxInput type="checkbox" checked onChange={() => toggleSkill(ref, false)} />
                                <ItemText>
                                    <ItemName>{ref}</ItemName>
                                    <ErrorHint>This skill no longer exists: uncheck it.</ErrorHint>
                                </ItemText>
                            </Item>
                        ))}
                    </>
                )}
                <SubTitle>Platform</SubTitle>
                {platformSkills.length ? platformSkills.map(renderSkill) : <Hint>No platform skills.</Hint>}
                <SubTitle>Group</SubTitle>
                {groupSkills.length ? groupSkills.map(renderSkill) : <Hint>No skills in this group.</Hint>}
            </Section>
        </>
    );
};

export default AiAgentToolsSelect;
