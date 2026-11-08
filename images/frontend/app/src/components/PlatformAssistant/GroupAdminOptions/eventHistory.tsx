// The history of a group's alarms or approvals (admin_api alarm_history / approval_history): the events of
// the Alarm or Approval nodes of its digital twins, kept 2 years in the IoT database. Shared by
// AlarmHistoryContainer and ApprovalHistoryContainer: a group, a range of days and optionally a digital
// twin; the table of the events (newest first); the detail of one event with the copy of the message that
// caused it; and the export of all their columns as CSV or JSON, to analyse them or train models.
import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import styled from "styled-components";
import { AxiosError, AxiosResponse } from "axios";
import { Column } from "../Utils/platformTable";
import { useAuthState, useAuthDispatch } from "../../../contexts/authContext";
import { axiosAuth, getDomainName, getProtocol } from "../../../tools/tools";
import { getAxiosInstance } from "../../../tools/axiosIntance";
import axiosErrorHandler from "../../../tools/axiosErrorHandler";
import TableWithPagination from "../Utils/TableWithPagination";
import Loader from "../../Tools/Loader";
import { IGroupManaged } from "../TableColumns/groupsManagedColumns";
import { IDigitalTwin } from "../TableColumns/digitalTwinsColumns";

export type HistoryKind = "alarm" | "approval";

export const HISTORY_RETENTION_DAYS = 730;
const DEFAULT_DAYS = 30;

// YYYY-MM-DD of a date (UTC, as admin_api reads the days)
export const isoDay = (date: Date): string => date.toISOString().slice(0, 10);

// The default range: the last 30 days, today included
export const defaultHistoryRange = (now = new Date()): { from: string; to: string } => ({
    from: isoDay(new Date(now.getTime() - (DEFAULT_DAYS - 1) * 24 * 3600 * 1000)),
    to: isoDay(now),
});

// What is wrong with a range ("" nothing): as admin_api checks it
export const historyRangeProblem = (from: string, to: string): string => {
    const re = /^\d{4}-\d{2}-\d{2}$/;
    if (!re.test(from) || !re.test(to)) return "Choose both days";
    const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / (24 * 3600 * 1000) + 1;
    if (days < 1) return "The first day is after the last one";
    if (days > HISTORY_RETENTION_DAYS) return `At most ${HISTORY_RETENTION_DAYS} days (the history is kept 2 years)`;
    return "";
};

export const historyQuery = (from: string, to: string, digitalTwinId: number | null, extra: Record<string, string> = {}) => {
    const params = new URLSearchParams({ from, to, ...extra });
    if (digitalTwinId) params.set("digitalTwinId", String(digitalTwinId));
    return params.toString();
};

export const historyUrl = (kind: HistoryKind, suffix: "" | "_event" | "_export", groupId: number, rest = "") =>
    `${getProtocol()}://${getDomainName()}/admin_api/${kind}_history${suffix}/${groupId}${rest}`;

// A time of an event, local and readable ("" none)
export const formatEventTime = (value: string | null | undefined): string => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(
        date.getMinutes(),
    )}:${pad(date.getSeconds())}`;
};

// A value of any type shown in a cell
export const formatEventValue = (value: unknown): string => {
    if (value === null || value === undefined) return "";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
};

// "1 h 2 min", "45 s": a wait or a duration
export const formatSeconds = (seconds: number | null | undefined): string => {
    if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return "";
    const s = Math.round(seconds);
    if (s < 60) return `${s} s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m} min ${s % 60} s`;
    const h = Math.floor(m / 60);
    if (h < 48) return `${h} h ${m % 60} min`;
    return `${Math.floor(h / 24)} d ${h % 24} h`;
};

const Container = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 100%;
`;

const HeaderContainer = styled.div`
    display: flex;
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px 24px;
    width: calc(100% - 40px);
    margin: 20px 20px 0 20px;
    color: white;
    font-size: 14px;
`;

const Label = styled.label`
    display: flex;
    align-items: center;
    gap: 8px;
`;

const fieldStyle = `
    background-color: #0c0d0f;
    color: white;
    border: 1px solid #2c3235;
    border-radius: 5px;
    padding: 6px 10px;
    font-size: 14px;
    outline: none;
    color-scheme: dark;

    &:hover,
    &:focus {
        border: 1px solid #3274d9;
    }
`;

const Select = styled.select`
    ${fieldStyle}
    cursor: pointer;
    max-width: 320px;
`;

const DateInput = styled.input`
    ${fieldStyle}
`;

export const Button = styled.button<{ primary?: boolean }>`
    background-color: ${(props) => (props.primary ? "#3274d9" : "#202226")};
    color: white;
    border: 1px solid ${(props) => (props.primary ? "#3274d9" : "#2c3235")};
    border-radius: 5px;
    padding: 6px 14px;
    font-size: 14px;
    cursor: pointer;

    &:hover:enabled {
        border: 1px solid #5a95f5;
    }

    &:disabled {
        opacity: 0.5;
        cursor: default;
    }
`;

const InfoText = styled.span`
    color: #c9c9c9;
`;

const WarningText = styled.span`
    color: #f2cc0c;
`;

const NoGroupsMessage = styled.div`
    color: white;
    margin-top: 40px;
    font-size: 16px;
`;

const DetailPanel = styled.div`
    width: calc(100% - 40px);
    margin: 15px 20px 0 20px;
    padding: 12px 15px;
    border: 1px solid #2c3235;
    border-radius: 5px;
    background-color: #141619;
    color: white;
    font-size: 13px;
    box-sizing: border-box;
`;

const DetailHeader = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    margin-bottom: 8px;
    font-size: 14px;
`;

const DetailJson = styled.pre`
    margin: 0;
    max-height: 360px;
    overflow: auto;
    white-space: pre-wrap;
    word-break: break-word;
    font-family: "DejaVu Sans Mono", Menlo, Consolas, monospace;
    color: #d8d9da;
`;

export const ViewButton = styled.button`
    background: none;
    border: none;
    color: #3274d9;
    cursor: pointer;
    padding: 0;
    font-size: 14px;

    &:hover {
        text-decoration: underline;
    }
`;

interface EventHistoryViewProps<E extends { eventId: string }> {
    kind: HistoryKind;
    groupsManaged: IGroupManaged[];
    digitalTwins: IDigitalTwin[];
    // the columns of the table: onView opens the detail of an event
    columns: (onView: (eventId: string) => void) => Column<any>[];
    toRow: (event: E) => object;
    // the title of the detail of an event
    detailTitle: (event: any) => ReactNode;
}

export function EventHistoryView<E extends { eventId: string }>({
    kind,
    groupsManaged,
    digitalTwins,
    columns,
    toRow,
    detailTitle,
}: EventHistoryViewProps<E>) {
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();
    const [groupId, setGroupId] = useState<number | null>(groupsManaged.length ? groupsManaged[0].id : null);
    const [range, setRange] = useState(defaultHistoryRange);
    const [digitalTwinId, setDigitalTwinId] = useState<number | null>(null);
    // the filter of the table shown (changes only with "Show")
    const [applied, setApplied] = useState<{ from: string; to: string; digitalTwinId: number | null } | null>(null);
    const [events, setEvents] = useState<E[]>([]);
    const [truncated, setTruncated] = useState(false);
    const [loading, setLoading] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [detail, setDetail] = useState<any | null>(null);

    const groupDigitalTwins = useMemo(
        () => digitalTwins.filter((dt) => Number(dt.groupId) === groupId),
        [digitalTwins, groupId],
    );
    const problem = historyRangeProblem(range.from, range.to);

    const load = useCallback(
        (filter: { from: string; to: string; digitalTwinId: number | null }) => {
            if (groupId === null) return;
            setLoading(true);
            setDetail(null);
            const url = historyUrl(kind, "", groupId, `?${historyQuery(filter.from, filter.to, filter.digitalTwinId)}`);
            getAxiosInstance(refreshToken, authDispatch)
                .get(url, axiosAuth(accessToken))
                .then((response: AxiosResponse<{ events: E[]; truncated: boolean }>) => {
                    setEvents(response.data.events);
                    setTruncated(response.data.truncated);
                    setLoading(false);
                })
                .catch((error: AxiosError) => {
                    setEvents([]);
                    setTruncated(false);
                    setLoading(false);
                    axiosErrorHandler(error, authDispatch);
                });
        },
        [kind, groupId, accessToken, refreshToken, authDispatch],
    );

    // the last 30 days of the group when it is chosen (not again when the session's token is renewed)
    const loadRef = useRef(load);
    loadRef.current = load;
    useEffect(() => {
        const filter = { ...defaultHistoryRange(), digitalTwinId: null };
        setRange({ from: filter.from, to: filter.to });
        setDigitalTwinId(null);
        setApplied(filter);
        loadRef.current(filter);
    }, [groupId, kind]);

    const show = () => {
        const filter = { ...range, digitalTwinId };
        setApplied(filter);
        load(filter);
    };

    const openDetail = useCallback(
        (eventId: string) => {
            if (groupId === null) return;
            getAxiosInstance(refreshToken, authDispatch)
                .get(historyUrl(kind, "_event", groupId, `/${eventId}`), axiosAuth(accessToken))
                .then((response: AxiosResponse<any>) => setDetail(response.data))
                .catch((error: AxiosError) => axiosErrorHandler(error, authDispatch));
        },
        [kind, groupId, accessToken, refreshToken, authDispatch],
    );

    const download = (format: "csv" | "json") => {
        if (groupId === null || !applied) return;
        setExporting(true);
        const url = historyUrl(kind, "_export", groupId, `?${historyQuery(applied.from, applied.to, applied.digitalTwinId, { format })}`);
        getAxiosInstance(refreshToken, authDispatch)
            .get(url, { ...axiosAuth(accessToken), responseType: "blob" as const })
            .then((response: AxiosResponse<Blob>) => {
                const href = URL.createObjectURL(response.data);
                const link = document.createElement("a");
                link.href = href;
                link.download = `${kind}_history_group_${groupId}_${applied.from}_${applied.to}.${format}`;
                document.body.appendChild(link);
                link.click();
                link.remove();
                setTimeout(() => URL.revokeObjectURL(href), 1000);
                setExporting(false);
            })
            .catch((error: AxiosError) => {
                setExporting(false);
                axiosErrorHandler(error, authDispatch);
            });
    };

    const rows = useMemo(() => events.map(toRow), [events, toRow]);
    const columnsTable = useMemo(() => columns(openDetail), [columns, openDetail]);

    if (groupsManaged.length === 0) {
        return <NoGroupsMessage>You do not manage any group.</NoGroupsMessage>;
    }

    return (
        <Container>
            <HeaderContainer>
                <Label>
                    Group:
                    <Select value={groupId ?? ""} onChange={(e) => setGroupId(parseInt(e.target.value, 10))}>
                        {groupsManaged.map((group) => (
                            <option key={group.id} value={group.id}>
                                {group.name} ({group.acronym}) - Id: {group.id}
                            </option>
                        ))}
                    </Select>
                </Label>
                <Label>
                    Digital twin:
                    <Select
                        aria-label="Digital twin"
                        value={digitalTwinId ?? ""}
                        onChange={(e) => setDigitalTwinId(e.target.value ? parseInt(e.target.value, 10) : null)}
                    >
                        <option value="">All</option>
                        {groupDigitalTwins.map((dt) => (
                            <option key={dt.id} value={dt.id}>
                                {dt.description || dt.digitalTwinUid}
                            </option>
                        ))}
                    </Select>
                </Label>
                <Label>
                    From:
                    <DateInput
                        type="date"
                        aria-label="From"
                        value={range.from}
                        onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
                    />
                </Label>
                <Label>
                    To:
                    <DateInput
                        type="date"
                        aria-label="To"
                        value={range.to}
                        onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
                    />
                </Label>
                <Button type="button" primary disabled={problem !== "" || loading} onClick={show}>
                    Show
                </Button>
                <Button type="button" disabled={!applied || exporting} onClick={() => download("csv")}>
                    Download CSV
                </Button>
                <Button type="button" disabled={!applied || exporting} onClick={() => download("json")}>
                    Download JSON
                </Button>
                {problem !== "" && <WarningText>{problem}</WarningText>}
                {truncated && (
                    <WarningText>Only the newest {events.length} events are shown: download them all or narrow the days</WarningText>
                )}
                <InfoText>Kept 2 years · days in UTC · the downloads have all the columns of the range shown</InfoText>
            </HeaderContainer>
            {detail && (
                <DetailPanel>
                    <DetailHeader>
                        <span>{detailTitle(detail)}</span>
                        <Button type="button" onClick={() => setDetail(null)}>
                            Close
                        </Button>
                    </DetailHeader>
                    <DetailJson>{JSON.stringify(detail, null, 2)}</DetailJson>
                </DetailPanel>
            )}
            {loading ? (
                <Loader />
            ) : (
                <TableWithPagination
                    dataTable={rows}
                    columnsTable={columnsTable}
                    componentName=""
                    reloadTable={applied ? () => load(applied) : undefined}
                />
            )}
        </Container>
    );
}

// The "View" cell of an event
export const viewColumn = (onView: (eventId: string) => void): Column<any> => ({
    Header: "Detail",
    accessor: "eventId",
    disableFilters: true,
    Cell: (props: any) => <ViewButton onClick={() => onView(props.value as string)}>View</ViewButton>,
});

