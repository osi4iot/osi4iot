// The Organization overview panel (orgOverview.ts): the indicators of the organization — availability, alarms,
// approvals, LLM tokens, pipelines and S3 archives — with a card per indicator, a table of the groups (what needs
// attention first), the availability and the alarms of the period, the most repeated alarms, the time in each status
// and the tokens by model. Read when it opens, when its period changes and every 5 minutes; the pipelines' status, live
// by NATS (state2sim) while it is shown. And its editor: the statuses that are not available and the period it opens
// with.
import { FC, useEffect, useId, useMemo, useRef, useState } from "react";
import styled from "styled-components";
import { Building2, Plus, Trash2, X } from "lucide-react";
import { scrollbarStyle } from "../../../Tools/FormTools";
import { EditorParts } from "./MarkdownPanel";
import { TONE_COLORS } from "./historyPanels";
import { WorkspacePanel } from "./workspaceLayout";
import type { SubjectListener } from "./ControlRoomPanels";
import {
  AVAILABILITY_TARGET,
  CHART_H,
  CHART_W,
  DEFAULT_UNAVAILABLE_STATUSES,
  ORG_OVERVIEW_MAX_STATUSES,
  ORG_OVERVIEW_PERIODS,
  OrgOverviewData,
  OrgOverviewLoader,
  OrgOverviewPeriod,
  OrgOverviewSettings,
  OverviewTone,
  PipelineCounts,
  PipelineSeen,
  PERIOD_LABELS,
  PLOT_BOTTOM,
  PLOT_LEFT,
  PLOT_RIGHT,
  PLOT_TOP,
  activeAlarmsTone,
  alarmLevelCount,
  alarmsChart,
  availabilityChart,
  availabilityTone,
  axisLabels,
  coverageText,
  formatBytes,
  formatHours,
  formatTokens,
  formatMinutes,
  formatPercent,
  orgOverviewSettingsProblems,
  pipelineCounts,
  pipelinesText,
  pipelinesTone,
  sortGroupsByAttention,
  statusColor,
  tokenUse,
} from "./orgOverview";

const font = `Roboto, "Helvetica Neue", Arial, sans-serif`;
// reads again this often while the page is visible (the indicators of a period change slowly)
export const ORG_OVERVIEW_REFRESH_MS = 5 * 60_000;

// ---------------------------------------------------------------------------------------------------------
// Reading

export const useOrgOverview = (
  load: OrgOverviewLoader | undefined,
  groupId: number,
  digitalTwinId: number,
  period: OrgOverviewPeriod,
  unavailable: string[],
  paused = false,
) => {
  const [data, setData] = useState<OrgOverviewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  const [loading, setLoading] = useState(false);
  const unavailableKey = unavailable.join(",");
  useEffect(() => {
    if (paused || !load) return;
    let controller: AbortController | null = null;
    let cancelled = false;
    const read = async () => {
      if (typeof document !== "undefined" && document.hidden) return;
      controller?.abort();
      controller = new AbortController();
      setLoading(true);
      try {
        const result = await load(
          groupId,
          digitalTwinId,
          period,
          unavailableKey ? unavailableKey.split(",") : [],
          controller.signal,
        );
        if (cancelled) return;
        setData(result);
        setError(null);
        setDenied(false);
      } catch (err: any) {
        if (
          cancelled ||
          err?.name === "CanceledError" ||
          err?.name === "AbortError"
        )
          return;
        if (err?.response?.status === 403) setDenied(true);
        setError(
          err?.response?.data?.message ||
            err?.message ||
            "The organization overview could not be read",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    read();
    const timer = window.setInterval(read, ORG_OVERVIEW_REFRESH_MS);
    return () => {
      cancelled = true;
      controller?.abort();
      window.clearInterval(timer);
    };
  }, [load, groupId, digitalTwinId, period, unavailableKey, paused]);
  return { data, error, denied, loading };
};

// The live status of the pipelines of the organization (state2sim of each digital twin with a pipeline)
export const usePipelineStatuses = (
  data: OrgOverviewData | null,
  listen: SubjectListener | undefined,
  paused = false,
) => {
  const [seen, setSeen] = useState<Record<number, PipelineSeen>>({});
  const since = useRef(Date.now());
  const subjects = useMemo(
    () => (data?.groups ?? []).flatMap((g) => g.pipelines.statusSubjects),
    [data],
  );
  const key = subjects.map((s) => `${s.digitalTwinId}=${s.subject}`).join("|");
  useEffect(() => {
    if (paused || !listen || !key) return;
    since.current = Date.now();
    const stops = subjects.map((s) =>
      listen(s.subject, (message) => {
        const status = (message as { pipelineStatus?: unknown } | null)
          ?.pipelineStatus;
        if (typeof status !== "string") return;
        setSeen((m) => ({
          ...m,
          [s.digitalTwinId]: { status, at: Date.now() },
        }));
      }),
    );
    return () => stops.forEach((stop) => stop());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused, listen, key]);
  return { seen, since: since.current, live: !!listen };
};

const useNow = (paused: boolean, every = 2_000) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (paused) return;
    const timer = window.setInterval(() => setNow(Date.now()), every);
    return () => window.clearInterval(timer);
  }, [paused, every]);
  return now;
};

// ---------------------------------------------------------------------------------------------------------
// Styles

const Wrap = styled.div`
  position: absolute;
  inset: 0;
  overflow: auto;
  padding: 10px 12px 14px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 12px;
  font: 400 13px ${font};
  color: #e6e8eb;
  ${scrollbarStyle}
`;

const Bar = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 16px;
`;

const Periods = styled.div`
  display: flex;
  border: 1px solid #2c3137;
  border-radius: 6px;
  overflow: hidden;

  button {
    min-height: 32px;
    min-width: 44px;
    padding: 0 12px;
    border: 0;
    background: #111316;
    color: #c7d0d9;
    font: 500 12px ${font};
    cursor: pointer;
  }
  button[aria-pressed="true"] {
    background: #3d71d9;
    color: #ffffff;
  }
  button:focus-visible {
    outline: 2px solid #9cc2ff;
    outline-offset: -2px;
  }
`;

const Cards = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: 10px;
`;

const Card = styled.div`
  background: #181b1f;
  border: 1px solid #2c3137;
  border-radius: 8px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;

  .label {
    color: #9aa1aa;
    font-size: 12px;
    font-weight: 500;
  }
  .value {
    font-size: 28px;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
  }
  .unit {
    color: #9aa1aa;
    font-size: 13px;
    margin-left: 4px;
  }
  .sub {
    color: #9aa1aa;
    font-size: 12px;
  }
`;

const Meter = styled.div`
  height: 4px;
  border-radius: 2px;
  background: #22262b;
  overflow: hidden;

  div {
    height: 100%;
    border-radius: 2px;
  }
`;

const Section = styled.section`
  background: #181b1f;
  border: 1px solid #2c3137;
  border-radius: 8px;
  padding: 10px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;

  h2 {
    margin: 0;
    font-size: 14px;
    font-weight: 500;
  }
  .head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
    flex-wrap: wrap;
  }
  .muted {
    color: #9aa1aa;
    font-size: 12px;
  }
`;

const TableBox = styled.div`
  overflow-x: auto;
  margin: 0 -14px;
  ${scrollbarStyle}
`;

const Table = styled.table`
  width: 100%;
  min-width: 900px;
  border-collapse: collapse;
  font-variant-numeric: tabular-nums;

  th {
    color: #9aa1aa;
    font-size: 11px;
    font-weight: 600;
    text-align: left;
    padding: 6px 8px;
    border-bottom: 1px solid #2c3137;
    white-space: nowrap;
  }
  td {
    padding: 7px 8px;
    border-bottom: 1px solid #22262b;
    vertical-align: top;
  }
  th:first-child,
  td:first-child {
    padding-left: 14px;
  }
  th:last-child,
  td:last-child {
    padding-right: 14px;
  }
  .sub {
    color: #7d848d;
    font-size: 11px;
  }
  .nowrap {
    white-space: nowrap;
  }
`;

const Grid = styled.div<{ $min: number }>`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(${({ $min }) => $min}px, 1fr));
  gap: 12px;
`;

const Legend = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px 12px;
  color: #9aa1aa;
  font-size: 12px;

  span {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  i {
    width: 10px;
    height: 10px;
    border-radius: 2px;
    display: inline-block;
  }
`;

const Pill = styled.span`
  display: inline-block;
  padding: 1px 8px;
  border-radius: 10px;
  border: 1px solid;
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
`;

const Muted = styled.p<{ $error?: boolean }>`
  margin: 0;
  font-size: 12px;
  color: ${({ $error }) => ($error ? "#ff7383" : "#9aa1aa")};
`;

const tonePill = (tone: OverviewTone, text: string) => {
  const c = TONE_COLORS[tone];
  return (
    <Pill style={{ color: c.fg, background: c.bg, borderColor: c.border }}>
      {text}
    </Pill>
  );
};

const BAR_COLOR: Record<OverviewTone, string> = {
  ok: "#73bf69",
  warning: "#ff9830",
  danger: "#f2495c",
  info: "#5794f2",
  muted: "#5a6069",
};

const meter = (fraction: number, tone: OverviewTone) => (
  <Meter aria-hidden="true">
    <div
      style={{
        width: `${Math.max(0, Math.min(100, fraction * 100))}%`,
        background: BAR_COLOR[tone],
      }}
    />
  </Meter>
);

// ---------------------------------------------------------------------------------------------------------
// The parts

const KeyCards: FC<{
  data: OrgOverviewData;
  pipelines: PipelineCounts | null;
}> = ({ data, pipelines }) => {
  const t = data.totals;
  const ai = tokenUse(
    data.ai.monthTokens,
    data.ai.monthlyTokenLimit,
    data.ai.warningPercent,
  );
  const alarmLevel = alarmLevelCount(t.activeAlarmsByLevel);
  const avTone = availabilityTone(t.availability);
  return (
    <Cards aria-label="Key indicators">
      <Card>
        <div
          className="head"
          style={{ display: "flex", justifyContent: "space-between", gap: 8 }}
        >
          <span className="label">Availability</span>
          {t.availability !== null &&
            tonePill(
              avTone,
              t.availability >= AVAILABILITY_TARGET
                ? "On target"
                : "Below target",
            )}
        </div>
        <div>
          <span className="value">{formatPercent(t.availability)}</span>
        </div>
        {meter(t.availability ?? 0, avTone)}
        <span className="sub">
          {t.assetsWithHistory
            ? `Target ${formatPercent(AVAILABILITY_TARGET)} · ${t.assetsWithHistory - t.inactiveAssets} of ${t.assets} assets measured`
            : "No asset has the state history on"}
        </span>
      </Card>
      <Card>
        <div
          style={{ display: "flex", justifyContent: "space-between", gap: 8 }}
        >
          <span className="label">Active alarms</span>
          {t.activeAlarms > 0 &&
            tonePill(
              alarmLevel ? "danger" : "warning",
              alarmLevel ? `${alarmLevel} Alarm` : "Warnings",
            )}
        </div>
        <div>
          <span className="value">{t.activeAlarms}</span>
        </div>
        {meter(t.activeAlarms ? alarmLevel / t.activeAlarms : 0, "danger")}
        <span className="sub">
          {Object.entries(t.activeAlarmsByLevel)
            .map(([level, n]) => `${n} ${level}`)
            .join(" · ") || "None now"}
        </span>
      </Card>
      <Card>
        <span className="label">Alarms raised</span>
        <div>
          <span className="value">{t.alarmsRaised}</span>
        </div>
        {meter(0, "muted")}
        <span className="sub">
          MTTA {formatMinutes(t.mttaMinutes)} ·{" "}
          {PERIOD_LABELS[data.period].toLowerCase()}
        </span>
      </Card>
      <Card>
        <span className="label">Approvals pending</span>
        <div>
          <span
            className="value"
            style={{
              color: t.approvalsPending ? TONE_COLORS.warning.fg : undefined,
            }}
          >
            {t.approvalsPending}
          </span>
        </div>
        {meter(0, "muted")}
        <span className="sub">Requests waiting for a decision</span>
      </Card>
      <Card>
        <span className="label">No data recorded</span>
        <div>
          <span
            className="value"
            style={{
              color: t.inactiveAssets ? TONE_COLORS.warning.fg : undefined,
            }}
          >
            {t.inactiveAssets}
          </span>
          <span className="unit">
            {t.inactiveAssets === 1 ? "asset" : "assets"}
          </span>
        </div>
        {meter(
          t.assetsWithHistory ? t.inactiveAssets / t.assetsWithHistory : 0,
          "warning",
        )}
        <span className="sub">Inactive: state not written in the period</span>
      </Card>
      <Card>
        <div
          style={{ display: "flex", justifyContent: "space-between", gap: 8 }}
        >
          <span className="label">AI tokens this month</span>
          {ai.fraction !== null &&
            tonePill(ai.tone, `${Math.round(ai.fraction * 100)}%`)}
        </div>
        <div>
          <span className="value">{formatTokens(data.ai.monthTokens)}</span>
          {data.ai.monthlyTokenLimit > 0 && (
            <span className="unit">
              / {formatTokens(data.ai.monthlyTokenLimit)}
            </span>
          )}
        </div>
        {meter(ai.fraction ?? 0, ai.tone === "ok" ? "info" : ai.tone)}
        <span className="sub">
          {data.ai.monthlyTokenLimit > 0
            ? `Warning at ${data.ai.warningPercent || 80}% of the organization's limit`
            : "The organization has no monthly limit"}
        </span>
      </Card>
      <Card>
        <div
          style={{ display: "flex", justifyContent: "space-between", gap: 8 }}
        >
          <span className="label">Pipelines</span>
          {pipelines &&
            pipelines.error > 0 &&
            tonePill("danger", `${pipelines.error} error`)}
        </div>
        <div>
          {pipelines ? (
            <>
              <span className="value">
                {pipelines.waiting === pipelines.total && pipelines.total > 0
                  ? "…"
                  : pipelines.running}
              </span>
              <span className="unit">/ {pipelines.total} running</span>
            </>
          ) : (
            <>
              <span className="value">{t.pipelines.deployed}</span>
              <span className="unit">deployed</span>
            </>
          )}
        </div>
        {meter(
          pipelines && pipelines.total
            ? pipelines.running / pipelines.total
            : 0,
          pipelines ? pipelinesTone(pipelines) : "muted",
        )}
        <span className="sub">
          {t.pipelines.failures}{" "}
          {t.pipelines.failures === 1 ? "failure" : "failures"} ·{" "}
          {t.pipelines.nodeErrors} node{" "}
          {t.pipelines.nodeErrors === 1 ? "error" : "errors"} in{" "}
          {data.pipelineLogDays} {data.pipelineLogDays === 1 ? "day" : "days"}
        </span>
      </Card>
      <Card>
        <span className="label">S3 archives</span>
        <div>
          <span className="value">{formatBytes(t.s3.bytes)}</span>
        </div>
        {meter(0, "muted")}
        <span className="sub">
          {t.s3.folders} {t.s3.folders === 1 ? "folder" : "folders"}
          {t.s3.lastStorage
            ? ` · last stored ${new Date(t.s3.lastStorage).toLocaleDateString()}`
            : ""}
        </span>
      </Card>
    </Cards>
  );
};

const GroupsTable: FC<{
  data: OrgOverviewData;
  pipelinesOf: (g: OrgOverviewData["groups"][number]) => PipelineCounts | null;
}> = ({ data, pipelinesOf }) => {
  const groups = sortGroupsByAttention(data.groups);
  return (
    <Section aria-labelledby="org-groups">
      <div className="head">
        <h2 id="org-groups">Groups</h2>
        <span className="muted">
          What needs attention first · {PERIOD_LABELS[data.period]}
        </span>
      </div>
      <TableBox>
        <Table aria-label="Groups of the organization">
          <thead>
            <tr>
              <th>Group</th>
              <th>Availability</th>
              <th title="Mean time between failures">MTBF</th>
              <th title="Mean time to repair">MTTR</th>
              <th>Alarms raised</th>
              <th title="Mean time to acknowledge">MTTA</th>
              <th>Active alarms</th>
              <th>Approvals pending</th>
              <th>AI tokens (month)</th>
              <th>Pipelines</th>
              <th>S3 archives</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <tr key={g.id}>
                <td className="nowrap">
                  <span style={{ fontWeight: 500 }}>{g.name}</span>
                  <div className="sub">{coverageText(g)}</div>
                </td>
                <td>
                  {g.availability === null ? (
                    g.assetsWithHistory > 0 &&
                    g.inactiveAssets === g.assetsWithHistory ? (
                      tonePill("muted", "No data recorded")
                    ) : (
                      <span className="sub">—</span>
                    )
                  ) : (
                    tonePill(
                      availabilityTone(g.availability),
                      formatPercent(g.availability),
                    )
                  )}
                </td>
                <td className="nowrap">
                  {g.availability === null ? (
                    "—"
                  ) : g.failures === 0 ? (
                    <span className="sub">No failures</span>
                  ) : (
                    formatHours(g.mtbfHours)
                  )}
                </td>
                <td className="nowrap">{formatHours(g.mttrHours)}</td>
                <td>{g.alarmsRaised}</td>
                <td className="nowrap">{formatMinutes(g.mttaMinutes)}</td>
                <td>
                  {g.activeAlarms ? (
                    tonePill(activeAlarmsTone(g), String(g.activeAlarms))
                  ) : (
                    <span className="sub">0</span>
                  )}
                </td>
                <td>
                  {g.approvalsPending ? (
                    tonePill("warning", String(g.approvalsPending))
                  ) : (
                    <span className="sub">0</span>
                  )}
                </td>
                <td style={{ minWidth: 150 }}>
                  <TokenCell
                    tokens={g.ai.monthTokens}
                    limit={g.ai.monthlyTokenLimit}
                    warningPercent={data.ai.warningPercent}
                  />
                </td>
                <td className="nowrap">
                  <PipelineCell
                    counts={pipelinesOf(g)}
                    deployed={g.pipelines.deployed}
                  />
                  {(g.pipelines.failures > 0 || g.pipelines.nodeErrors > 0) && (
                    <div
                      className="sub"
                      title={`In the kept pipeline logs of the last ${data.pipelineLogDays} days`}
                    >
                      {g.pipelines.failures} failures · {g.pipelines.nodeErrors}{" "}
                      node errors
                    </div>
                  )}
                </td>
                <td className="nowrap">
                  {g.s3.folders === 0 ? (
                    <span className="sub">—</span>
                  ) : (
                    <span
                      title={
                        g.s3.lastStorage
                          ? `Last stored ${new Date(g.s3.lastStorage).toLocaleString()}`
                          : undefined
                      }
                    >
                      {formatBytes(g.s3.bytes)}
                      <div className="sub">
                        {g.s3.folders}{" "}
                        {g.s3.folders === 1 ? "folder" : "folders"}
                      </div>
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </TableBox>
      <Muted>
        Availability, MTBF and MTTR: only the assets with the state history on
        (Edit asset → State history). Not available:{" "}
        {data.unavailableStatuses.join(", ")}. An asset whose state was not
        written in the period has no data recorded and does not count in the
        availability. Pipelines: their status now (each one says it every second
        while it runs) and, below, the failures and node errors of the last{" "}
        {data.pipelineLogDays} days in their kept logs.
      </Muted>
    </Section>
  );
};

const TokenCell: FC<{
  tokens: number;
  limit: number;
  warningPercent: number;
}> = ({ tokens, limit, warningPercent }) => {
  const use = tokenUse(tokens, limit, warningPercent);
  if (!limit)
    return (
      <span title="The group has no monthly limit (the organization's applies)">
        {tokens ? formatTokens(tokens) : <span className="sub">0</span>}
      </span>
    );
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, minWidth: 50 }}>
        {meter(use.fraction ?? 0, use.tone === "ok" ? "info" : use.tone)}
      </div>
      <span
        className="nowrap"
        style={{
          color:
            use.tone === "danger"
              ? TONE_COLORS.danger.fg
              : use.tone === "warning"
                ? TONE_COLORS.warning.fg
                : "#9aa1aa",
          fontSize: 12,
        }}
      >
        {formatTokens(tokens)} / {formatTokens(limit)}
      </span>
    </div>
  );
};

const PipelineCell: FC<{ counts: PipelineCounts | null; deployed: number }> = ({
  counts,
  deployed,
}) => {
  if (deployed === 0) return <span className="sub">None</span>;
  if (!counts) return <span>{deployed} deployed</span>;
  return tonePill(pipelinesTone(counts), pipelinesText(counts));
};

const AiByModel: FC<{ data: OrgOverviewData }> = ({ data }) => {
  const max = Math.max(1, ...data.ai.byModel.map((m) => m.tokens));
  return (
    <Section aria-labelledby="org-ai">
      <div className="head">
        <h2 id="org-ai">AI tokens by model</h2>
        <span className="muted">This month ({data.ai.month}, UTC)</span>
      </div>
      {data.ai.byModel.length === 0 ? (
        <Muted>No AI usage this month.</Muted>
      ) : (
        data.ai.byModel.map((m) => (
          <div
            key={`${m.providerType}-${m.model}`}
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) minmax(60px, 120px) 56px",
              gap: 8,
              alignItems: "center",
            }}
          >
            <span
              style={{
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                fontFamily: "'Roboto Mono', monospace",
                fontSize: 12,
                color: "#c7d0d9",
              }}
              title={m.providerType}
            >
              {m.model}
            </span>
            {meter(m.tokens / max, "info")}
            <span
              style={{ textAlign: "right", color: "#9aa1aa", fontSize: 12 }}
            >
              {formatTokens(m.tokens)}
            </span>
          </div>
        ))
      )}
    </Section>
  );
};

const AvailabilityChart: FC<{ data: OrgOverviewData }> = ({ data }) => {
  const chart = availabilityChart(data.series);
  const labels = axisLabels(data.series, data.bucket);
  return (
    <Section aria-labelledby="org-availability">
      <div className="head">
        <h2 id="org-availability">Availability</h2>
        <span className="muted">Organization · by {data.bucket}</span>
      </div>
      {chart.points.length === 0 ? (
        <Muted>
          No availability in the period: no asset with the state history on has
          data recorded.
        </Muted>
      ) : (
        <svg
          viewBox={`0 0 ${CHART_W} ${CHART_H}`}
          style={{ width: "100%", height: "auto" }}
          role="img"
          aria-label={`Availability by ${data.bucket}`}
        >
          {[1, chart.mid, chart.min].map((v) => {
            const y =
              v === 1 ? PLOT_TOP : v === chart.min ? PLOT_BOTTOM : chart.midY;
            return (
              <g key={v}>
                <line
                  x1={PLOT_LEFT}
                  y1={y}
                  x2={PLOT_RIGHT}
                  y2={y}
                  stroke="#22262b"
                />
                <text
                  x={PLOT_LEFT - 6}
                  y={y + 4}
                  fill="#9aa1aa"
                  fontSize="11"
                  textAnchor="end"
                >
                  {formatPercent(v)}
                </text>
              </g>
            );
          })}
          <line
            x1={PLOT_LEFT}
            y1={chart.targetY}
            x2={PLOT_RIGHT}
            y2={chart.targetY}
            stroke="#8fd48a"
            strokeDasharray="4 4"
            opacity="0.6"
          />
          <text
            x={PLOT_RIGHT - 2}
            y={chart.targetY - 5}
            fill="#8fd48a"
            fontSize="11"
            textAnchor="end"
          >
            Target {formatPercent(AVAILABILITY_TARGET)}
          </text>
          <path d={chart.path} fill="none" stroke="#5794f2" strokeWidth="2" />
          {chart.points.map((p) => (
            <circle key={p.start} cx={p.x} cy={p.y} r="3" fill="#5794f2">
              <title>{`${new Date(p.start).toLocaleDateString(undefined, { timeZone: "UTC" })}: ${formatPercent(p.value)}`}</title>
            </circle>
          ))}
          {labels.map((l) => (
            <text
              key={l.i}
              x={l.x}
              y={CHART_H - 8}
              fill="#9aa1aa"
              fontSize="11"
              textAnchor="middle"
            >
              {l.label}
            </text>
          ))}
        </svg>
      )}
    </Section>
  );
};

const AlarmsChart: FC<{ data: OrgOverviewData }> = ({ data }) => {
  const chart = alarmsChart(data.series);
  const labels = axisLabels(data.series, data.bucket);
  return (
    <Section aria-labelledby="org-alarms">
      <div className="head">
        <h2 id="org-alarms">Alarms raised</h2>
        <Legend>
          <span>
            <i style={{ background: "#f2495c" }} />
            Alarm
          </span>
          <span>
            <i style={{ background: "#ff9830" }} />
            Other levels
          </span>
        </Legend>
      </div>
      <svg
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        style={{ width: "100%", height: "auto" }}
        role="img"
        aria-label={`Alarms raised by ${data.bucket}`}
      >
        {chart.ticks.map((t) => (
          <g key={t.value}>
            <line
              x1={PLOT_LEFT}
              y1={t.y}
              x2={PLOT_RIGHT}
              y2={t.y}
              stroke="#22262b"
            />
            <text
              x={PLOT_LEFT - 6}
              y={t.y + 4}
              fill="#9aa1aa"
              fontSize="11"
              textAnchor="end"
            >
              {t.value}
            </text>
          </g>
        ))}
        {chart.bars.map((b) => (
          <g key={b.start}>
            <title>{`${new Date(b.start).toLocaleDateString(undefined, { timeZone: "UTC" })}: ${b.alarm} Alarm, ${b.other} other`}</title>
            {b.oh > 0 && (
              <rect
                x={b.x}
                y={b.oy}
                width={b.width}
                height={b.oh}
                fill="#ff9830"
                rx="2"
              />
            )}
            {b.ah > 0 && (
              <rect
                x={b.x}
                y={b.ay}
                width={b.width}
                height={b.ah}
                fill="#f2495c"
                rx="2"
              />
            )}
          </g>
        ))}
        {labels.map((l) => (
          <text
            key={l.i}
            x={l.x}
            y={CHART_H - 8}
            fill="#9aa1aa"
            fontSize="11"
            textAnchor="middle"
          >
            {l.label}
          </text>
        ))}
      </svg>
    </Section>
  );
};

const TopAlarms: FC<{ data: OrgOverviewData }> = ({ data }) => {
  const max = Math.max(1, ...data.topAlarms.map((t) => t.count));
  return (
    <Section aria-labelledby="org-top">
      <div className="head">
        <h2 id="org-top">Most repeated alarms</h2>
        <span className="muted">Often thresholds to tune</span>
      </div>
      {data.topAlarms.length === 0 ? (
        <Muted>No alarm was raised in the period.</Muted>
      ) : (
        <ol
          style={{
            margin: 0,
            padding: 0,
            listStyle: "none",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {data.topAlarms.map((t, i) => (
            <li
              key={`${t.groupId}-${t.name}-${t.asset}-${i}`}
              style={{
                display: "grid",
                gridTemplateColumns: "20px minmax(0, 1fr) 40px",
                gap: 8,
                alignItems: "center",
              }}
            >
              <span
                style={{ color: "#7d848d", fontSize: 12, textAlign: "right" }}
              >
                {i + 1}
              </span>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 3,
                  minWidth: 0,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 8,
                  }}
                >
                  <span
                    style={{
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {t.name || t.node}
                  </span>
                  <span
                    style={{
                      color: "#7d848d",
                      fontSize: 11,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {t.group}
                    {t.asset ? ` · ${t.asset}` : ""}
                  </span>
                </div>
                {meter(t.count / max, i < 2 ? "danger" : "warning")}
              </div>
              <span
                style={{
                  textAlign: "right",
                  fontWeight: 500,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {t.count}
              </span>
            </li>
          ))}
        </ol>
      )}
    </Section>
  );
};

const StatusTime: FC<{ data: OrgOverviewData }> = ({ data }) => {
  const groups = data.groups.filter((g) => g.assetsWithHistory > 0);
  // a colour per status, the same in every row
  const statuses: string[] = [];
  for (const g of groups)
    for (const s of g.statusTime)
      if (!statuses.includes(s.status)) statuses.push(s.status);
  const colorOf = (status: string) =>
    status === "No data recorded"
      ? statusColor(status, [], 0)
      : statusColor(status, data.unavailableStatuses, statuses.indexOf(status));
  const shown = [
    ...statuses,
    ...(groups.some((g) => g.noDataSeconds > 0) ? ["No data recorded"] : []),
  ];
  return (
    <Section aria-labelledby="org-status">
      <div className="head">
        <h2 id="org-status">Time in each status</h2>
        <Legend>
          {shown.map((s) => (
            <span key={s}>
              <i style={{ background: colorOf(s) }} />
              {s}
            </span>
          ))}
        </Legend>
      </div>
      {groups.length === 0 ? (
        <Muted>No asset has the state history on.</Muted>
      ) : (
        groups.map((g) => {
          const parts = [
            ...g.statusTime,
            ...(g.noDataSeconds > 0
              ? [{ status: "No data recorded", seconds: g.noDataSeconds }]
              : []),
          ];
          const total = parts.reduce((s, p) => s + p.seconds, 0) || 1;
          const aria = parts
            .map(
              (p) => `${p.status} ${((p.seconds / total) * 100).toFixed(1)}%`,
            )
            .join(", ");
          return (
            <div
              key={g.id}
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(90px, 160px) minmax(0, 1fr)",
                gap: 10,
                alignItems: "center",
              }}
            >
              <span
                style={{
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  color: "#c7d0d9",
                }}
              >
                {g.name}
              </span>
              <div
                role="img"
                aria-label={`${g.name}: ${aria}`}
                style={{
                  display: "flex",
                  height: 14,
                  borderRadius: 3,
                  overflow: "hidden",
                  background: "#22262b",
                }}
              >
                {parts.map((p) => (
                  <div
                    key={p.status}
                    title={`${p.status}: ${((p.seconds / total) * 100).toFixed(1)}%`}
                    style={{
                      width: `${(p.seconds / total) * 100}%`,
                      background: colorOf(p.status),
                    }}
                  />
                ))}
              </div>
            </div>
          );
        })
      )}
    </Section>
  );
};

// ---------------------------------------------------------------------------------------------------------
// The panel

export const OrgOverviewContent: FC<{
  data: OrgOverviewData;
  period: OrgOverviewPeriod;
  onPeriod: (period: OrgOverviewPeriod) => void;
  loading?: boolean;
  error?: string | null;
  // the pipelines' status, when it is listened to
  pipelines?: {
    seen: Record<number, PipelineSeen>;
    since: number;
    now: number;
  } | null;
}> = ({ data, period, onPeriod, loading = false, error, pipelines = null }) => {
  const countsOf = (subjects: { digitalTwinId: number }[]) =>
    pipelines
      ? pipelineCounts(subjects, pipelines.seen, pipelines.now, pipelines.since)
      : null;
  const all = countsOf(data.groups.flatMap((g) => g.pipelines.statusSubjects));
  return (
    <Wrap>
      <Bar>
        <Muted>
          {data.totals.groups} groups · {data.totals.assets} assets
          {loading ? " · reading…" : ""}
        </Muted>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Muted as="span">Period</Muted>
          <Periods role="group" aria-label="Period">
            {ORG_OVERVIEW_PERIODS.map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={period === p}
                title={PERIOD_LABELS[p]}
                onClick={() => onPeriod(p)}
              >
                {p}
              </button>
            ))}
          </Periods>
        </div>
      </Bar>
      {error && <Muted $error>{error} (showing the last data read)</Muted>}
      <KeyCards data={data} pipelines={all} />
      <GroupsTable
        data={data}
        pipelinesOf={(g) => countsOf(g.pipelines.statusSubjects)}
      />
      <Grid $min={380}>
        <AvailabilityChart data={data} />
        <AlarmsChart data={data} />
      </Grid>
      <Grid $min={340}>
        <TopAlarms data={data} />
        <StatusTime data={data} />
        <AiByModel data={data} />
      </Grid>
    </Wrap>
  );
};

export interface OrgOverviewPanelProps {
  panel: WorkspacePanel;
  groupId: number;
  digitalTwinId: number;
  load: OrgOverviewLoader;
  paused?: boolean;
  // listens to the pipelines' status (NATS)
  live?: { listen?: SubjectListener };
}

export const OrgOverviewPanel: FC<OrgOverviewPanelProps> = ({
  panel,
  groupId,
  digitalTwinId,
  load,
  paused = false,
  live,
}) => {
  const [period, setPeriod] = useState<OrgOverviewPeriod>(
    panel.period ?? "30d",
  );
  useEffect(() => setPeriod(panel.period ?? "30d"), [panel.period]);
  const unavailable = panel.unavailableStatuses?.length
    ? panel.unavailableStatuses
    : DEFAULT_UNAVAILABLE_STATUSES;
  const { data, error, denied, loading } = useOrgOverview(
    load,
    groupId,
    digitalTwinId,
    period,
    unavailable,
    paused,
  );
  const statuses = usePipelineStatuses(data, live?.listen, paused);
  const now = useNow(paused || !statuses.live);
  if (denied) {
    return (
      <Wrap>
        <Muted>
          The organization overview is only for the administrators of the
          organization and of the platform.
        </Muted>
      </Wrap>
    );
  }
  if (!data) {
    return (
      <Wrap>
        <Muted $error={!!error}>
          {error ?? "Reading the organization overview…"}
        </Muted>
      </Wrap>
    );
  }
  return (
    <OrgOverviewContent
      data={data}
      period={period}
      onPeriod={setPeriod}
      loading={loading}
      error={error}
      pipelines={
        statuses.live
          ? { seen: statuses.seen, since: statuses.since, now }
          : null
      }
    />
  );
};

// ---------------------------------------------------------------------------------------------------------
// The editor

const { Backdrop, Dialog, Head, Help, Actions, Secondary, Primary, Close } =
  EditorParts;

const Rows = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const Row = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) 34px;
  gap: 6px;
  align-items: center;

  input {
    width: 100%;
    min-width: 0;
  }
`;

const IconButton = styled.button`
  width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid #2c3137;
  border-radius: 8px;
  color: #c7cbd1;
  cursor: pointer;

  svg {
    width: 15px;
    height: 15px;
  }
`;

const AddButton = styled.button`
  align-self: flex-start;
  height: 30px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 10px;
  background: #1b1e22;
  border: 1px solid #2c3137;
  border-radius: 8px;
  color: #d5d9de;
  font: 500 12px ${font};
  cursor: pointer;

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  svg {
    width: 14px;
    height: 14px;
  }
`;

const Form = styled.div`
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding-right: 4px;
  ${scrollbarStyle}

  .label {
    display: block;
    margin-bottom: 6px;
    color: #9aa1aa;
    font-size: 12px;
    font-weight: 600;
  }
`;

const Problems = styled.ul`
  margin: 0;
  padding-left: 18px;
  color: #ff8a95;
  font-size: 12px;
`;

export interface OrgOverviewEditorProps {
  panel: WorkspacePanel;
  onApply: (panel: WorkspacePanel) => void;
  onDiscard: () => void;
}

export const OrgOverviewEditor: FC<OrgOverviewEditorProps> = ({
  panel,
  onApply,
  onDiscard,
}) => {
  const titleId = useId();
  const [title, setTitle] = useState(panel.title ?? "");
  const [statuses, setStatuses] = useState<string[]>(
    panel.unavailableStatuses?.length
      ? panel.unavailableStatuses
      : DEFAULT_UNAVAILABLE_STATUSES,
  );
  const [period, setPeriod] = useState<OrgOverviewPeriod>(
    panel.period ?? "30d",
  );
  const settings: OrgOverviewSettings = useMemo(() => {
    const list = statuses.map((s) => s.trim()).filter(Boolean);
    return { unavailableStatuses: list, period };
  }, [statuses, period]);
  const problems = useMemo(
    () => orgOverviewSettingsProblems(settings),
    [settings],
  );
  const setStatus = (i: number, value: string) =>
    setStatuses((list) => list.map((s, j) => (j === i ? value : s)));

  return (
    <Backdrop>
      <Dialog
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={{ maxWidth: 520 }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            onDiscard();
          }
        }}
        onSubmit={(e) => {
          e.preventDefault();
          if (problems.length) return;
          const next: WorkspacePanel = { ...panel };
          delete next.unavailableStatuses;
          delete next.period;
          const list = settings.unavailableStatuses ?? [];
          // "Alarm" alone is the default: not stored
          if (
            list.length &&
            !(list.length === 1 && list[0] === DEFAULT_UNAVAILABLE_STATUSES[0])
          )
            next.unavailableStatuses = list;
          if (period !== "30d") next.period = period;
          if (title.trim()) next.title = title.trim().slice(0, 80);
          else delete next.title;
          onApply(next);
        }}
      >
        <Head>
          <h2 id={titleId}>
            <Building2 aria-hidden="true" />
            Edit organization overview
          </h2>
          <Close
            type="button"
            aria-label="Discard the changes"
            onClick={onDiscard}
          >
            <X aria-hidden="true" />
          </Close>
        </Head>
        <Form>
          <label>
            <span className="label">Title (optional)</span>
            <input
              value={title}
              maxLength={80}
              placeholder="Organization overview"
              onChange={(e) => setTitle(e.target.value)}
              style={{ width: "100%" }}
            />
          </label>
          <div>
            <span className="label">
              Statuses that are not available ({statuses.length}/
              {ORG_OVERVIEW_MAX_STATUSES})
            </span>
            <Rows>
              {statuses.map((s, i) => (
                <Row key={i}>
                  <input
                    aria-label={`Unavailable status ${i + 1}`}
                    placeholder="Stopped"
                    value={s}
                    maxLength={40}
                    onChange={(e) => setStatus(i, e.target.value)}
                  />
                  <IconButton
                    type="button"
                    aria-label={`Remove status ${i + 1}`}
                    onClick={() =>
                      setStatuses((list) => list.filter((_, j) => j !== i))
                    }
                  >
                    <Trash2 aria-hidden="true" />
                  </IconButton>
                </Row>
              ))}
              <AddButton
                type="button"
                disabled={statuses.length >= ORG_OVERVIEW_MAX_STATUSES}
                onClick={() => setStatuses((list) => [...list, ""])}
              >
                <Plus aria-hidden="true" />
                Add status
              </AddButton>
            </Rows>
            <Help style={{ marginTop: 6 }}>
              The time of an asset in any other status counts as available. Each
              pipeline names its statuses (Asset state node): add those that
              mean the asset does not work, e.g. <code>Stopped</code> or{" "}
              <code>Fault</code>. None: only <code>Alarm</code>.
            </Help>
          </div>
          <label>
            <span className="label">Opens with the period</span>
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as OrgOverviewPeriod)}
              style={{ width: 200 }}
            >
              {ORG_OVERVIEW_PERIODS.map((p) => (
                <option key={p} value={p}>
                  {PERIOD_LABELS[p]}
                </option>
              ))}
            </select>
          </label>
          {problems.length > 0 && (
            <Problems>
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </Problems>
          )}
        </Form>
        <Actions>
          <Secondary type="button" onClick={onDiscard}>
            Cancel
          </Secondary>
          <Primary
            type="submit"
            disabled={problems.length > 0}
            style={
              problems.length
                ? { opacity: 0.5, cursor: "not-allowed" }
                : undefined
            }
          >
            Apply
          </Primary>
        </Actions>
      </Dialog>
    </Backdrop>
  );
};
