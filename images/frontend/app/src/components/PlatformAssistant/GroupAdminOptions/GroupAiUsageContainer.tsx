// Group admin → AI usage: what each group the user administers has consumed of the organization's LLM provider
// this month (tokens), its monthly limit and how much of it is used (README, "Permissions"). The limit is set by
// the organization's administrator (Organization admin → AI usage); at it, the group is stopped until the month ends.
import { FC, useCallback, useEffect, useState } from "react";
import styled from "styled-components";
import { AxiosError } from "axios";
import { RefreshCw } from "lucide-react";
import { useAuthDispatch, useAuthState } from "../../../contexts/authContext";
import { axiosAuth, getDomainName, getProtocol } from "../../../tools/tools";
import { getAxiosInstance } from "../../../tools/axiosIntance";
import axiosErrorHandler from "../../../tools/axiosErrorHandler";
import { canAdministerGroup } from "../../../tools/groupRoles";
import { useTable } from "../../../state";
import { focusRing, panelColors as c } from "../DigitalTwin3DViewer/AssistantPanel/controls";

export type GroupUsageState = "none" | "ok" | "warning" | "stopped";

// what admin_api answers (llm_usage_group/:groupId)
export interface GroupUsage {
    groupId: number;
    name: string;
    acronym: string;
    month: string;
    monthTokens: number;
    monthlyTokenLimit: number; // 0: no limit
    warningPercent: number;
    state: GroupUsageState;
}

const intFormat = new Intl.NumberFormat();
export const formatTokens = (n: number) => intFormat.format(Math.round(n || 0));

// the share of the limit used (0 without a limit), whole percent, at most 999
export const usedPercent = (u: Pick<GroupUsage, "monthTokens" | "monthlyTokenLimit">): number =>
    u.monthlyTokenLimit > 0 ? Math.min(999, Math.floor((u.monthTokens / u.monthlyTokenLimit) * 100)) : 0;

const STATE_TEXT: Record<GroupUsageState, string> = {
    none: "No limit",
    ok: "Within the limit",
    warning: "Near the limit",
    stopped: "Stopped until the month ends",
};

const STATE_COLOR: Record<GroupUsageState, string> = {
    none: c.textMuted,
    ok: c.okText,
    warning: "#ffb35c",
    stopped: c.danger,
};

export const monthText = (month: string): string => {
    const [y, m] = month.split("-").map(Number);
    if (!y || !m) return month;
    return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });
};

const Page = styled.div`
    width: 100%;
    max-width: 1000px;
    box-sizing: border-box;
    padding: 20px 24px 40px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    color: ${c.text};
    font-family: Roboto, "Helvetica Neue", Arial, sans-serif;
`;

const Toolbar = styled.div`
    display: flex;
    align-items: center;
    gap: 10px;

    h1 {
        margin: 0 auto 0 0;
        font: 600 18px Roboto, Arial, sans-serif;
    }
`;

const Refresh = styled.button`
    height: 32px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0 12px;
    border-radius: 8px;
    border: 1px solid ${c.border};
    background: ${c.field};
    color: ${c.textSecondary};
    font: 500 13px Roboto, Arial, sans-serif;
    cursor: pointer;
    ${focusRing}

    svg {
        width: 14px;
        height: 14px;
    }
`;

const Card = styled.section`
    padding: 16px;
    border-radius: 12px;
    background: ${c.surface};
    border: 1px solid ${c.border};

    h2 {
        margin: 0 0 10px;
        display: flex;
        justify-content: space-between;
        gap: 12px;
        font: 600 15px Roboto, Arial, sans-serif;
    }
    h2 small {
        color: ${c.textMuted};
        font-weight: 400;
    }
    .numbers {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 8px;
        font: 400 13px Roboto, Arial, sans-serif;
        color: ${c.textSecondary};
        font-variant-numeric: tabular-nums;
    }
    .bar {
        position: relative;
        height: 10px;
        border-radius: 5px;
        background: ${c.track};
        overflow: hidden;
    }
    .fill {
        height: 100%;
        border-radius: 5px;
    }
    .marker {
        position: absolute;
        top: 0;
        bottom: 0;
        width: 2px;
        background: rgba(255, 255, 255, 0.55);
    }
    .state {
        margin-top: 8px;
        font: 600 13px Roboto, Arial, sans-serif;
    }
`;

const Note = styled.p`
    margin: 0;
    font: 400 13px/1.5 Roboto, Arial, sans-serif;
    color: ${c.textMuted};
`;

export const GroupUsageCard: FC<{ usage: GroupUsage }> = ({ usage }) => {
    const percent = usedPercent(usage);
    const limit = usage.monthlyTokenLimit;
    return (
        <Card aria-label={`AI usage of ${usage.name}`}>
            <h2>
                <span>
                    {usage.name} <small>({usage.acronym})</small>
                </span>
                <small>{monthText(usage.month)} (UTC)</small>
            </h2>
            <div className="numbers">
                <span>
                    <b style={{ color: c.text }}>{formatTokens(usage.monthTokens)}</b> tokens this month
                    {limit > 0 ? ` of ${formatTokens(limit)}` : ""}
                </span>
                {limit > 0 && <span>{percent} %</span>}
            </div>
            {limit > 0 && (
                <div
                    className="bar"
                    role="progressbar"
                    aria-label={`Tokens of ${usage.name} this month`}
                    aria-valuemin={0}
                    aria-valuemax={limit}
                    aria-valuenow={Math.min(usage.monthTokens, limit)}
                >
                    <div className="fill" style={{ width: `${Math.min(100, percent)}%`, background: STATE_COLOR[usage.state] }} />
                    <div className="marker" style={{ left: `${usage.warningPercent}%` }} title={`Warning at ${usage.warningPercent} %`} />
                </div>
            )}
            <div className="state" style={{ color: STATE_COLOR[usage.state] }}>
                {STATE_TEXT[usage.state]}
            </div>
        </Card>
    );
};

const domainName = getDomainName();
const protocol = getProtocol();

const GroupAiUsageContainer: FC = () => {
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();
    const groupsManaged = useTable("groupsManaged");
    const [usages, setUsages] = useState<GroupUsage[] | null>(null);
    const [reloads, setReloads] = useState(0);
    const administered = groupsManaged.filter((g) => canAdministerGroup(g));
    const groupIds = administered.map((g) => g.id).join(",");

    const load = useCallback(async () => {
        const ids = groupIds ? groupIds.split(",").map(Number) : [];
        const http = getAxiosInstance(refreshToken, authDispatch);
        const config = axiosAuth(accessToken);
        const results = await Promise.all(
            ids.map((id) =>
                http
                    .get(`${protocol}://${domainName}/admin_api/llm_usage_group/${id}`, config)
                    .then((response) => response.data as GroupUsage | null)
                    .catch((error: AxiosError) => {
                        axiosErrorHandler(error, authDispatch);
                        return null;
                    }),
            ),
        );
        return results.filter((u): u is GroupUsage => !!u);
    }, [groupIds, accessToken, refreshToken, authDispatch]);

    useEffect(() => {
        let cancelled = false;
        load().then((list) => {
            if (!cancelled) setUsages(list);
        });
        return () => {
            cancelled = true;
        };
    }, [load, reloads]);

    return (
        <Page>
            <Toolbar>
                <h1>AI usage</h1>
                <Refresh type="button" onClick={() => setReloads((n) => n + 1)}>
                    <RefreshCw aria-hidden="true" />
                    Refresh
                </Refresh>
            </Toolbar>
            {usages === null ? (
                <Note>Loading…</Note>
            ) : usages.length === 0 ? (
                <Note>You administer no group.</Note>
            ) : (
                usages.map((u) => <GroupUsageCard key={u.groupId} usage={u} />)
            )}
            <Note>
                The tokens of the group's AI agents, translators, transcriptions and voices this month. The organization's
                administrator sets each group's monthly limit (Organization admin → AI usage). Near the limit and at it, a warning
                appears in the logs of the group's digital twins; at the limit the group's AI is stopped until the month ends.
            </Note>
        </Page>
    );
};

export default GroupAiUsageContainer;
