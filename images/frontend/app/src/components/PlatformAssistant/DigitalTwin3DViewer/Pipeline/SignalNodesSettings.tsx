// Settings editors of the signal nodes (Switch, Deadband, Window, Join), shown in the Settings tab of the node
// properties panel. Each gets the node's form data and a change handler (key, value).
import { FC, useEffect, useState } from "react";
import styled from "styled-components";
import { Trash2 } from "lucide-react";
import { Button, CheckboxInput, FormGroup, Input, Label, Select, TextArea } from "./types";
import {
    ApprovalSettings,
    DegradationSettings,
    OeeSettings,
    TotalizerItem,
    TotalizerSettings,
    ANOMALY_MAX_WINDOW,
    AnomalySettings,
    POSE_PARTS_EXAMPLE,
    PoseEstimationSettings,
    DNV_CATEGORIES,
    RainflowSettings,
    SNLineSetting,
    VibrationBand,
    VibrationSettings,
    anomalyNumOutputs,
    dnvCurve,
    AlarmSettings,
    MachineRule,
    MachineStateSettings,
    WatchdogSettings,
    alarmNumOutputs,
    watchdogNumOutputs,
    DeadbandSettings,
    JoinSettings,
    JoinSource,
    SWITCH_OPERATORS,
    SignalNodeType,
    SwitchRule,
    SwitchSettings,
    WINDOW_MAX_SAMPLES,
    WINDOW_STATS,
    WindowSettings,
    deadbandNumOutputs,
    parseList,
    signalProblems,
    switchNumOutputs,
    windowKeepsSamples,
} from "./signalNodes";

type OnChange = (key: string, value: unknown) => void;

const Hint = styled.span`
    color: #9ca3af;
    font-weight: 400;
`;

const Note = styled.div`
    color: #9a9a9a;
    font-size: 12px;
    margin: -4px 0 12px;
    line-height: 1.45;
`;

const Card = styled.div`
    padding: 10px;
    margin-bottom: 10px;
    border-radius: 6px;
    background-color: #2f3743;
    border: 1px solid #4b5563;
`;

const Row = styled.div`
    display: flex;
    gap: 8px;
    align-items: center;
    margin-bottom: 8px;

    & > * {
        min-width: 0;
    }
`;

const Small = styled.span`
    flex: none;
    color: #9ca3af;
    font-size: 12px;
    white-space: nowrap;

    ${Row} > & {
        min-width: auto;
    }
`;

const RemoveButton = styled.button`
    flex: none;
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    border: 1px solid #4b5563;
    border-radius: 6px;
    background: transparent;
    color: #c9c9c9;
    cursor: pointer;

    &:hover {
        color: #ffffff;
        border-color: #f2495c;
    }
`;

const Checks = styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: 6px 14px;
`;

const CheckLabel = styled.label`
    display: flex;
    align-items: center;
    gap: 6px;
    color: #d1d5db;
    font-size: 13px;
    cursor: pointer;
`;

const Problems = styled.div`
    margin-bottom: 14px;
    padding: 8px 10px;
    border-radius: 6px;
    border: 1px solid #f2495c;
    color: #ffb3b3;
    font-size: 12px;
    line-height: 1.5;
`;

const num = (text: string, fallback = 0) => {
    const n = parseFloat(text);
    return Number.isFinite(n) ? n : fallback;
};

// A list of paths edited as comma separated text (committed on blur, so that commas can be typed)
const ListInput: FC<{ value: string[] | undefined; onChange: (v: string[]) => void; placeholder?: string; label: string }> = ({
    value,
    onChange,
    placeholder,
    label,
}) => {
    const joined = (value ?? []).join(", ");
    const [text, setText] = useState(joined);
    useEffect(() => setText(joined), [joined]);
    return (
        <Input
            type="text"
            aria-label={label}
            value={text}
            placeholder={placeholder}
            onChange={(e: { target: { value: string } }) => setText(e.target.value)}
            onBlur={() => onChange(parseList(text))}
        />
    );
};

const PathField: FC<{ label: string; hint: string; value: string | undefined; onChange: (v: string) => void; placeholder?: string }> = ({
    label,
    hint,
    value,
    onChange,
    placeholder,
}) => (
    <FormGroup>
        <Label>
            {label} <Hint>({hint})</Hint>
        </Label>
        <Input
            type="text"
            aria-label={label}
            value={value ?? ""}
            placeholder={placeholder}
            onChange={(e: { target: { value: string } }) => onChange(e.target.value.trim())}
        />
    </FormGroup>
);

const KeyAndTime: FC<{ settings: { keyPath?: string; timePath?: string }; onChange: OnChange; keyHint: string }> = ({
    settings,
    onChange,
    keyHint,
}) => (
    <>
        <PathField
            label="Key"
            hint={keyHint}
            value={settings.keyPath}
            placeholder="topic"
            onChange={(v) => onChange("keyPath", v)}
        />
        <PathField
            label="Timestamp field"
            hint="ISO 8601 or epoch ms/s; empty: arrival time"
            value={settings.timePath}
            placeholder="payload.timestamp"
            onChange={(v) => onChange("timePath", v)}
        />
    </>
);

// ---- Switch ----

export const SwitchSettingsEditor: FC<{ settings: SwitchSettings; onChange: OnChange }> = ({ settings, onChange }) => {
    const rules = settings.rules ?? [];
    const setRules = (next: SwitchRule[]) => {
        onChange("rules", next);
        onChange("numOutputs", switchNumOutputs({ ...settings, rules: next }));
    };
    const update = (i: number, change: Partial<SwitchRule>) => setRules(rules.map((r, j) => (j === i ? { ...r, ...change } : r)));
    return (
        <>
            <PathField
                label="Property"
                hint="the field the rules check"
                value={settings.property}
                placeholder="payload.value"
                onChange={(v) => onChange("property", v)}
            />
            <FormGroup>
                <Label>Rules</Label>
                {rules.map((rule, i) => {
                    const op = SWITCH_OPERATORS.find((o) => o.value === rule.operator);
                    return (
                        <Card key={i}>
                            <Row>
                                <Small>→ {i}</Small>
                                <Select
                                    aria-label={`Rule ${i + 1} operator`}
                                    value={rule.operator}
                                    onChange={(e: { target: { value: string } }) =>
                                        update(i, { operator: e.target.value as SwitchRule["operator"] })
                                    }
                                >
                                    {SWITCH_OPERATORS.map((o) => (
                                        <option key={o.value} value={o.value}>
                                            {o.label}
                                        </option>
                                    ))}
                                </Select>
                                {(op?.values ?? 0) >= 1 && (
                                    <Input
                                        type="text"
                                        aria-label={`Rule ${i + 1} value`}
                                        value={rule.value ?? ""}
                                        placeholder={op?.value === "regex" ? "^ALARM" : "value"}
                                        onChange={(e: { target: { value: string } }) => update(i, { value: e.target.value })}
                                    />
                                )}
                                {op?.values === 2 && (
                                    <>
                                        <Small>and</Small>
                                        <Input
                                            type="text"
                                            aria-label={`Rule ${i + 1} second value`}
                                            value={rule.value2 ?? ""}
                                            onChange={(e: { target: { value: string } }) => update(i, { value2: e.target.value })}
                                        />
                                    </>
                                )}
                                <RemoveButton
                                    type="button"
                                    aria-label={`Remove rule ${i + 1}`}
                                    onClick={() => setRules(rules.filter((_, j) => j !== i))}
                                >
                                    <Trash2 size={14} />
                                </RemoveButton>
                            </Row>
                        </Card>
                    );
                })}
                <Button variant="secondary" onClick={() => setRules([...rules, { operator: "eq", value: "", value2: "" }])}>
                    + Add rule
                </Button>
            </FormGroup>
            <FormGroup>
                <Label>When several rules match</Label>
                <Select
                    aria-label="Check mode"
                    value={settings.checkMode ?? "first"}
                    onChange={(e: { target: { value: string } }) => onChange("checkMode", e.target.value)}
                >
                    <option value="first">Stop at the first rule that matches</option>
                    <option value="all">Send to every rule that matches</option>
                </Select>
            </FormGroup>
            <CheckLabel>
                <CheckboxInput
                    type="checkbox"
                    checked={!!settings.otherwise}
                    onChange={(e: { target: { checked: boolean } }) => {
                        onChange("otherwise", e.target.checked);
                        onChange("numOutputs", switchNumOutputs({ ...settings, otherwise: e.target.checked }));
                    }}
                />
                Otherwise output (→ {rules.length}) for the messages no rule matches
            </CheckLabel>
        </>
    );
};

// ---- Deadband ----

export const DeadbandSettingsEditor: FC<{ settings: DeadbandSettings; onChange: OnChange }> = ({ settings, onChange }) => (
    <>
        <FormGroup>
            <Label>
                Fields <Hint>(comma separated; "payload": the whole payload)</Hint>
            </Label>
            <ListInput
                label="Fields"
                value={settings.fields}
                placeholder="payload.value, payload.status"
                onChange={(v) => onChange("fields", v)}
            />
        </FormGroup>
        <Note>A message passes when any of them changed by the band or more since the last message that passed.</Note>
        <FormGroup>
            <Label>Band</Label>
            <Row>
                <Input
                    type="number"
                    min="0"
                    step="any"
                    aria-label="Band"
                    value={settings.band ?? 0}
                    onChange={(e: { target: { value: string } }) => onChange("band", Math.max(0, num(e.target.value)))}
                />
                <Select
                    aria-label="Band type"
                    value={settings.bandType ?? "absolute"}
                    onChange={(e: { target: { value: string } }) => onChange("bandType", e.target.value)}
                >
                    <option value="absolute">absolute</option>
                    <option value="percent">% of the last value</option>
                </Select>
            </Row>
        </FormGroup>
        <Note>0: any change passes. Text fields pass whenever they change.</Note>
        <FormGroup>
            <Label>
                Maximum interval (s) <Hint>(let one through after this long even if unchanged; 0: never)</Hint>
            </Label>
            <Input
                type="number"
                min="0"
                step="1"
                aria-label="Maximum interval"
                value={settings.maxIntervalSeconds ?? 0}
                onChange={(e: { target: { value: string } }) => onChange("maxIntervalSeconds", Math.max(0, num(e.target.value)))}
            />
        </FormGroup>
        <KeyAndTime settings={settings} onChange={onChange} keyHint="one state per value, e.g. per sensor; empty: one for all" />
        <CheckLabel>
            <CheckboxInput
                type="checkbox"
                checked={!!settings.blockedOutput}
                onChange={(e: { target: { checked: boolean } }) => {
                    onChange("blockedOutput", e.target.checked);
                    onChange("numOutputs", deadbandNumOutputs({ blockedOutput: e.target.checked }));
                }}
            />
            Second output (→ 1) with the messages blocked
        </CheckLabel>
    </>
);

// ---- Window ----

export const WindowSettingsEditor: FC<{ settings: WindowSettings; onChange: OnChange }> = ({ settings, onChange }) => {
    const type = settings.windowType ?? "count";
    const stats = settings.stats ?? [];
    const toggleStat = (stat: string, on: boolean) =>
        onChange(
            "stats",
            WINDOW_STATS.map((w) => w.value).filter((v) => (v === stat ? on : stats.includes(v))),
        );
    return (
        <>
            <FormGroup>
                <Label>
                    Numeric fields <Hint>(comma separated)</Hint>
                </Label>
                <ListInput
                    label="Fields"
                    value={settings.fields}
                    placeholder="payload.Eps_1, payload.Eps_2"
                    onChange={(v) => onChange("fields", v)}
                />
            </FormGroup>
            <FormGroup>
                <Label>Window</Label>
                <Row>
                    <Select
                        aria-label="Window type"
                        value={type}
                        onChange={(e: { target: { value: string } }) => onChange("windowType", e.target.value)}
                    >
                        <option value="count">messages</option>
                        <option value="time">time</option>
                    </Select>
                    {type === "count" ? (
                        <Input
                            type="number"
                            min="1"
                            step="1"
                            aria-label="Window size"
                            value={settings.size ?? 10}
                            onChange={(e: { target: { value: string } }) => onChange("size", Math.max(1, Math.round(num(e.target.value, 1))))}
                        />
                    ) : (
                        <>
                            <Input
                                type="number"
                                min="1"
                                step="1"
                                aria-label="Window duration"
                                value={settings.durationSeconds ?? 60}
                                onChange={(e: { target: { value: string } }) =>
                                    onChange("durationSeconds", Math.max(1, num(e.target.value, 1)))
                                }
                            />
                            <Small>s</Small>
                        </>
                    )}
                    <Select
                        aria-label="Window mode"
                        value={settings.mode ?? "tumbling"}
                        onChange={(e: { target: { value: string } }) => onChange("mode", e.target.value)}
                    >
                        <option value="tumbling">fixed</option>
                        <option value="sliding">sliding</option>
                    </Select>
                </Row>
            </FormGroup>
            <Note>
                {settings.mode === "sliding"
                    ? "Sliding: every message sends the statistics of the last messages or seconds."
                    : type === "time"
                      ? "Fixed time windows start on multiples of the duration (e.g. every minute) and are sent when they end, even if no more messages arrive."
                      : "Fixed: the statistics are sent every N messages, then the window starts again."}
            </Note>
            <FormGroup>
                <Label>Statistics</Label>
                <Checks>
                    {WINDOW_STATS.map((w) => (
                        <CheckLabel key={w.value}>
                            <CheckboxInput
                                type="checkbox"
                                aria-label={`Statistic ${w.value}`}
                                checked={stats.includes(w.value)}
                                onChange={(e: { target: { checked: boolean } }) => toggleStat(w.value, e.target.checked)}
                            />
                            {w.label}
                        </CheckLabel>
                    ))}
                </Checks>
            </FormGroup>
            {windowKeepsSamples(settings) && (
                <Note>
                    Sliding windows and percentiles keep the samples: at most {WINDOW_MAX_SAMPLES} per key (the
                    oldest are dropped, and the output says "truncated").
                </Note>
            )}
            <KeyAndTime settings={settings} onChange={onChange} keyHint="one window per value, e.g. per sensor; empty: one for all" />
        </>
    );
};

// A list of sources: topics of the digital twin or other source ids, each with a name (Join, Watchdog).
// A topic source matches the messages that arrive on that topic; a source id matches the messages whose
// key path (a field such as payload.sensorId) holds that value.
const SourcesEditor: FC<{
    sources: JoinSource[];
    onChange: (s: JoinSource[]) => void;
    topicRefs: string[];
    label: string;
    hint: string;
    nameHint: string;
}> = ({ sources, onChange, topicRefs, label, hint, nameHint }) => {
    const setSources = onChange;
    const update = (i: number, change: Partial<JoinSource>) => setSources(sources.map((s, j) => (j === i ? { ...s, ...change } : s)));
    return (
        <>
            <FormGroup>
                <Label>
                    {label} <Hint>({hint})</Hint>
                </Label>
                {sources.map((src, i) => {
                    const custom = !src.topicRef;
                    return (
                        <Card key={i}>
                            <Row>
                                <Select
                                    aria-label={`Source ${i + 1}`}
                                    value={custom ? "__custom" : src.topicRef}
                                    onChange={(e: { target: { value: string } }) =>
                                        e.target.value === "__custom"
                                            ? update(i, { topicRef: undefined, key: src.key ?? "" })
                                            : update(i, { topicRef: e.target.value, key: undefined })
                                    }
                                >
                                    {topicRefs.map((ref) => (
                                        <option key={ref} value={ref}>
                                            topic {ref}
                                        </option>
                                    ))}
                                    <option value="__custom">other source id…</option>
                                </Select>
                                {custom && (
                                    <Input
                                        type="text"
                                        aria-label={`Source ${i + 1} id`}
                                        title="The value the key path holds in this source's messages"
                                        value={src.key ?? ""}
                                        placeholder="source id, e.g. S1"
                                        onChange={(e: { target: { value: string } }) => update(i, { key: e.target.value })}
                                    />
                                )}
                                <Small title={nameHint}>named</Small>
                                <Input
                                    type="text"
                                    aria-label={`Source ${i + 1} name`}
                                    title={nameHint}
                                    value={src.alias ?? ""}
                                    placeholder={src.topicRef || src.key || "name"}
                                    onChange={(e: { target: { value: string } }) => update(i, { alias: e.target.value.trim() })}
                                />
                                <RemoveButton
                                    type="button"
                                    aria-label={`Remove source ${i + 1}`}
                                    onClick={() => setSources(sources.filter((_, j) => j !== i))}
                                >
                                    <Trash2 size={14} />
                                </RemoveButton>
                            </Row>
                        </Card>
                    );
                })}
                <Button
                    variant="secondary"
                    onClick={() =>
                        setSources([...sources, topicRefs.length > 0 ? { topicRef: topicRefs[0], alias: "" } : { key: "", alias: "" }])
                    }
                >
                    + Add source
                </Button>
            </FormGroup>
        </>
    );
};

// Sources given by topic are matched against the topic of the messages, so when all the sources are
// topics the key path is set to "topic" (pipelines rejects topic sources with another key path).
const changeSources = (sources: JoinSource[], keyPath: string | undefined, onChange: OnChange) => {
    onChange("sources", sources);
    if (sources.length > 0 && sources.every((s) => s.topicRef) && (keyPath ?? "") !== "topic") onChange("keyPath", "topic");
};

// The key path of Join and Watchdog: where each message carries the id of its source.
const SourceKeyPath: FC<{ settings: { keyPath?: string; sources?: JoinSource[] }; onChange: OnChange; emptyMeans: string }> = ({
    settings,
    onChange,
    emptyMeans,
}) => {
    const sources = settings.sources ?? [];
    const keyPath = (settings.keyPath ?? "").trim();
    const ids = sources.filter((s) => !s.topicRef && (s.key ?? "").trim());
    return (
        <>
            <PathField
                label="Key path"
                hint={`where each message carries its source id: topic, or a field such as payload.sensorId; empty: ${emptyMeans}`}
                value={settings.keyPath}
                placeholder="topic"
                onChange={(v) => onChange("keyPath", v)}
            />
            {ids.length > 0 && (keyPath === "topic" || (keyPath === "" && emptyMeans === "topic")) && (
                <Note>
                    The source ids ({ids.map((s) => `"${s.key}"`).join(", ")}) are compared with the topic of each message, its
                    full NATS subject. If they are values of a field, write that field here (e.g. payload.sensorId).
                </Note>
            )}
        </>
    );
};

const JOIN_MODE_NOTES: Record<string, string> = {
    latest: "Sends on every message, with the latest value of each source; at first, with the sources that have arrived.",
    all: "Silent until every source has a value; then sends on every message, reusing the latest value of the slower sources.",
    set:
        "Sends once every source has a value, then empties: each combination is sent once. A source that arrives again " +
        "before the others keeps only its latest value.",
};

// ---- Join ----

export const JoinSettingsEditor: FC<{ settings: JoinSettings; onChange: OnChange; topicRefs: string[] }> = ({
    settings,
    onChange,
    topicRefs,
}) => {
    const sources = settings.sources ?? [];
    const mode = settings.mode ?? "latest";
    return (
        <>
            <SourcesEditor
                sources={sources}
                onChange={(next) => changeSources(next, settings.keyPath, onChange)}
                topicRefs={topicRefs}
                label="Sources"
                hint="a topic, or a source id read at the key path; each named as it appears in the output"
                nameHint="Its name in the output: { name: value, ... }. Empty: the topic reference or the source id."
            />
            {sources.length === 0 && <Note>Without sources, every value of the key path is a source (by its own name).</Note>}
            <SourceKeyPath settings={settings} onChange={onChange} emptyMeans="topic" />
            <FormGroup>
                <Label>Send</Label>
                <Select aria-label="Join mode" value={mode} onChange={(e: { target: { value: string } }) => onChange("mode", e.target.value)}>
                    <option value="latest">on every message, with the latest value of each source</option>
                    <option value="all">on every message, once all sources have a value</option>
                    <option value="set">once per complete set, then start again</option>
                </Select>
            </FormGroup>
            <Note>{JOIN_MODE_NOTES[mode]}</Note>
            {mode === "set" && (
                <FormGroup>
                    <Label>
                        Timeout (s) <Hint>(from the first message of a set: send it incomplete, with "_missing"; 0: wait)</Hint>
                    </Label>
                    <Input
                        type="number"
                        min="0"
                        step="1"
                        aria-label="Timeout"
                        value={settings.timeoutSeconds ?? 0}
                        onChange={(e: { target: { value: string } }) => onChange("timeoutSeconds", Math.max(0, num(e.target.value)))}
                    />
                </FormGroup>
            )}
            <FormGroup>
                <Label>
                    Maximum age (s) <Hint>(older values are dropped, so they are not combined with new ones; 0: kept)</Hint>
                </Label>
                <Input
                    type="number"
                    min="0"
                    step="1"
                    aria-label="Maximum age"
                    value={settings.maxAgeSeconds ?? 0}
                    onChange={(e: { target: { value: string } }) => onChange("maxAgeSeconds", Math.max(0, num(e.target.value)))}
                />
            </FormGroup>
            <FormGroup>
                <Label>Output</Label>
                <Select
                    aria-label="Join output"
                    value={settings.output ?? "nested"}
                    onChange={(e: { target: { value: string } }) => onChange("output", e.target.value)}
                >
                    <option value="nested">nested by name: {"{ strain: {…}, wind: {…} }"}</option>
                    <option value="flat">flat: the payloads merged (the newest wins)</option>
                </Select>
            </FormGroup>
            <PathField
                label="Value"
                hint="what is kept of each message"
                value={settings.valuePath}
                placeholder="payload"
                onChange={(v) => onChange("valuePath", v)}
            />
            <PathField
                label="Timestamp field"
                hint="ISO 8601 or epoch ms/s; empty: arrival time"
                value={settings.timePath}
                placeholder="payload.timestamp"
                onChange={(v) => onChange("timePath", v)}
            />
        </>
    );
};


// ---- Watchdog ----

export const WatchdogSettingsEditor: FC<{ settings: WatchdogSettings; onChange: OnChange; topicRefs: string[] }> = ({
    settings,
    onChange,
    topicRefs,
}) => (
    <>
        <FormGroup>
            <Label>
                Timeout (s) <Hint>(silence that counts as lost)</Hint>
            </Label>
            <Input
                type="number"
                min="1"
                step="1"
                aria-label="Timeout"
                value={settings.timeoutSeconds ?? 60}
                onChange={(e: { target: { value: string } }) => onChange("timeoutSeconds", Math.max(1, num(e.target.value, 1)))}
            />
        </FormGroup>
        <Note>A few times the source's usual interval: e.g. 10 s for data every second, 180 s for data every minute.</Note>
        <FormGroup>
            <Label>
                Repeat (s) <Hint>(warn again while still silent; 0: once)</Hint>
            </Label>
            <Input
                type="number"
                min="0"
                step="1"
                aria-label="Repeat"
                value={settings.repeatSeconds ?? 0}
                onChange={(e: { target: { value: string } }) => onChange("repeatSeconds", Math.max(0, num(e.target.value)))}
            />
        </FormGroup>
        <SourcesEditor
            sources={settings.sources ?? []}
            onChange={(next) => changeSources(next, settings.keyPath, onChange)}
            topicRefs={topicRefs}
            label="Expected sources"
            hint="optional: also watched before their first message"
            nameHint="Its name in the lost and restored events. Empty: the topic reference or the source id."
        />
        <SourceKeyPath settings={settings} onChange={onChange} emptyMeans="the input as a whole (one watch)" />
        <CheckLabel>
            <CheckboxInput
                type="checkbox"
                checked={!!settings.passThrough}
                onChange={(e: { target: { checked: boolean } }) => {
                    onChange("passThrough", e.target.checked);
                    onChange("numOutputs", watchdogNumOutputs({ passThrough: e.target.checked }));
                }}
            />
            Third output (→ 2) with the messages, unchanged
        </CheckLabel>
        <Note style={{ marginTop: 10 }}>Output 0: a source lost. Output 1: a source back, with its downtime.</Note>
    </>
);

// ---- Alarm ----

export const AlarmSettingsEditor: FC<{ settings: AlarmSettings; onChange: OnChange }> = ({ settings, onChange }) => {
    const condition = settings.condition ?? "high";
    const levelInput = (key: "warning" | "alarm", label: string) => (
        <Input
            type="text"
            aria-label={label}
            value={settings[key] ?? ""}
            placeholder={condition === "equals" ? "value" : "none"}
            onChange={(e: { target: { value: string } }) => onChange(key, e.target.value)}
        />
    );
    return (
        <>
            <PathField
                label="Property"
                hint="the field the alarm watches"
                value={settings.property}
                placeholder="payload.value"
                onChange={(v) => onChange("property", v)}
            />
            <FormGroup>
                <Label>Condition</Label>
                <Select
                    aria-label="Condition"
                    value={condition}
                    onChange={(e: { target: { value: string } }) => onChange("condition", e.target.value)}
                >
                    <option value="high">high: the value reaches or exceeds the level</option>
                    <option value="low">low: the value reaches or falls below the level</option>
                    <option value="equals">equals: the value is the given one (code, true...)</option>
                </Select>
            </FormGroup>
            <FormGroup>
                <Label>
                    Levels <Hint>(either or both)</Hint>
                </Label>
                <Row>
                    <Small>Warning</Small>
                    {levelInput("warning", "Warning level")}
                    <Small>Alarm</Small>
                    {levelInput("alarm", "Alarm level")}
                    <Input
                        type="text"
                        aria-label="Units"
                        value={settings.units ?? ""}
                        placeholder="units"
                        style={{ maxWidth: 80 }}
                        onChange={(e: { target: { value: string } }) => onChange("units", e.target.value.trim())}
                    />
                </Row>
            </FormGroup>
            {condition !== "equals" && (
                <FormGroup>
                    <Label>
                        Hysteresis <Hint>(how far back the value must go to leave a level)</Hint>
                    </Label>
                    <Input
                        type="number"
                        min="0"
                        step="any"
                        aria-label="Hysteresis"
                        value={settings.hysteresis ?? 0}
                        onChange={(e: { target: { value: string } }) => onChange("hysteresis", Math.max(0, num(e.target.value)))}
                    />
                </FormGroup>
            )}
            <FormGroup>
                <Label>
                    Delays (s) <Hint>(the condition must hold this long to activate / to clear)</Hint>
                </Label>
                <Row>
                    <Small>on</Small>
                    <Input
                        type="number"
                        min="0"
                        step="1"
                        aria-label="On delay"
                        value={settings.onDelaySeconds ?? 0}
                        onChange={(e: { target: { value: string } }) => onChange("onDelaySeconds", Math.max(0, num(e.target.value)))}
                    />
                    <Small>off</Small>
                    <Input
                        type="number"
                        min="0"
                        step="1"
                        aria-label="Off delay"
                        value={settings.offDelaySeconds ?? 0}
                        onChange={(e: { target: { value: string } }) => onChange("offDelaySeconds", Math.max(0, num(e.target.value)))}
                    />
                </Row>
            </FormGroup>
            <PathField
                label="Description"
                hint="optional, added to the events"
                value={settings.description}
                placeholder="Wind above the cut-out speed of the turbine"
                onChange={(v) => onChange("description", v)}
            />
            <PathField
                label="Key"
                hint="one alarm per value, e.g. per sensor; empty: one alarm"
                value={settings.keyPath}
                placeholder=""
                onChange={(v) => onChange("keyPath", v)}
            />
            <CheckLabel>
                <CheckboxInput
                    type="checkbox"
                    checked={!!settings.latched}
                    onChange={(e: { target: { checked: boolean } }) => onChange("latched", e.target.checked)}
                />
                Latched: back to normal only with a reset
            </CheckLabel>
            {settings.latched && (
                <Note style={{ marginTop: 6, marginBottom: 8 }}>
                    When the value is back to normal the alarm stays ("waiting for a reset") and keeps the asset status, until an
                    administrator of the group resets it on the Alarms page or with the node's button. If the value goes beyond the
                    level again before the reset, it is the same alarm (event reactivated).
                </Note>
            )}
            <CheckLabel>
                <CheckboxInput
                    type="checkbox"
                    checked={!!settings.statusOutput}
                    onChange={(e: { target: { checked: boolean } }) => {
                        onChange("statusOutput", e.target.checked);
                        onChange("numOutputs", alarmNumOutputs({ statusOutput: e.target.checked }));
                    }}
                />
                Status output (→ 1): payload.state when the status changes, for an Asset state node
            </CheckLabel>
            <CheckLabel style={{ marginTop: 8 }}>
                <CheckboxInput
                    type="checkbox"
                    checked={!!settings.updateAssetStatus}
                    onChange={(e: { target: { checked: boolean } }) => onChange("updateAssetStatus", e.target.checked)}
                />
                Update the asset status directly
            </CheckLabel>
            {settings.updateAssetStatus && (
                <Note style={{ marginTop: 6 }}>
                    The asset's status becomes the worst of the active alarms of all the Alarm nodes that do this (other
                    fields of its state are kept). Nothing else should write the status, or they will overwrite each other.
                    Each alarm that is not normal is also listed in the state's alarms (level, state, acknowledgement),
                    written when it changes, not with each value.
                </Note>
            )}
            <Note style={{ marginTop: 10 }}>
                Output 0: the events (raised, escalated, deescalated, cleared, acknowledged, shelved), each with a text in
                message. To acknowledge and shelve: the bell button of the node in the editor (group administrators, with
                the pipeline running), or commands on the input: payload.ack = true (or a key), payload.shelveMinutes = N
                (0: unshelve).
            </Note>
        </>
    );
};

// ---- Machine state ----

export const MachineStateSettingsEditor: FC<{ settings: MachineStateSettings; onChange: OnChange }> = ({ settings, onChange }) => {
    const rules = settings.rules ?? [];
    const setRules = (next: MachineRule[]) => onChange("rules", next);
    const update = (i: number, change: Partial<MachineRule>) => setRules(rules.map((r, j) => (j === i ? { ...r, ...change } : r)));
    return (
        <>
            <FormGroup>
                <Label>
                    States <Hint>(in order: the first rule that holds sets the state)</Hint>
                </Label>
                {rules.map((rule, i) => {
                    const op = SWITCH_OPERATORS.find((o) => o.value === rule.operator);
                    return (
                        <Card key={i}>
                            <Row>
                                <Input
                                    type="text"
                                    aria-label={`State ${i + 1} name`}
                                    value={rule.state ?? ""}
                                    placeholder="state, e.g. Running"
                                    onChange={(e: { target: { value: string } }) => update(i, { state: e.target.value })}
                                />
                                <Small>if</Small>
                                <Input
                                    type="text"
                                    aria-label={`State ${i + 1} property`}
                                    value={rule.property ?? ""}
                                    placeholder="payload.value"
                                    onChange={(e: { target: { value: string } }) => update(i, { property: e.target.value.trim() })}
                                />
                                <RemoveButton type="button" aria-label={`Remove state ${i + 1}`} onClick={() => setRules(rules.filter((_, j) => j !== i))}>
                                    <Trash2 size={14} />
                                </RemoveButton>
                            </Row>
                            <Row style={{ marginBottom: 0 }}>
                                <Select
                                    aria-label={`State ${i + 1} operator`}
                                    value={rule.operator}
                                    onChange={(e: { target: { value: string } }) => update(i, { operator: e.target.value as MachineRule["operator"] })}
                                >
                                    {SWITCH_OPERATORS.map((o) => (
                                        <option key={o.value} value={o.value}>
                                            {o.label}
                                        </option>
                                    ))}
                                </Select>
                                {(op?.values ?? 0) >= 1 && (
                                    <Input
                                        type="text"
                                        aria-label={`State ${i + 1} value`}
                                        value={rule.value ?? ""}
                                        onChange={(e: { target: { value: string } }) => update(i, { value: e.target.value })}
                                    />
                                )}
                                {op?.values === 2 && (
                                    <>
                                        <Small>and</Small>
                                        <Input
                                            type="text"
                                            aria-label={`State ${i + 1} second value`}
                                            value={rule.value2 ?? ""}
                                            onChange={(e: { target: { value: string } }) => update(i, { value2: e.target.value })}
                                        />
                                    </>
                                )}
                            </Row>
                        </Card>
                    );
                })}
                <Button
                    variant="secondary"
                    onClick={() => setRules([...rules, { state: "", property: "payload.value", operator: "gt", value: "0" }])}
                >
                    + Add state
                </Button>
            </FormGroup>
            <PathField
                label="Otherwise"
                hint="the state when no rule holds"
                value={settings.defaultState}
                placeholder="Stopped"
                onChange={(v) => onChange("defaultState", v)}
            />
            <FormGroup>
                <Label>
                    Minimum duration (s) <Hint>(a new state must hold this long, against flicker)</Hint>
                </Label>
                <Input
                    type="number"
                    min="0"
                    step="1"
                    aria-label="Minimum duration"
                    value={settings.minDurationSeconds ?? 0}
                    onChange={(e: { target: { value: string } }) => onChange("minDurationSeconds", Math.max(0, num(e.target.value)))}
                />
            </FormGroup>
            <FormGroup>
                <Label>
                    Unknown after (s) <Hint>(no data this long: state Unknown; 0: never)</Hint>
                </Label>
                <Input
                    type="number"
                    min="0"
                    step="1"
                    aria-label="Unknown after"
                    value={settings.unknownAfterSeconds ?? 0}
                    onChange={(e: { target: { value: string } }) => onChange("unknownAfterSeconds", Math.max(0, num(e.target.value)))}
                />
            </FormGroup>
            <FormGroup>
                <Label>
                    Shifts <Hint>(start times HH:MM, comma separated; empty: the calendar day)</Hint>
                </Label>
                <ListInput label="Shifts" value={settings.shifts} placeholder="06:00, 14:00, 22:00" onChange={(v) => onChange("shifts", v)} />
            </FormGroup>
            <FormGroup>
                <Label>
                    Summary every (min) <Hint>(besides the one at the end of each period; 0: only then)</Hint>
                </Label>
                <Input
                    type="number"
                    min="0"
                    step="1"
                    aria-label="Summary every"
                    value={settings.summaryEveryMinutes ?? 0}
                    onChange={(e: { target: { value: string } }) => onChange("summaryEveryMinutes", Math.max(0, num(e.target.value)))}
                />
            </FormGroup>
            <PathField
                label="Time zone"
                hint="of the days and shifts; empty: the group's"
                value={settings.timezone}
                placeholder="Atlantic/Canary"
                onChange={(v) => onChange("timezone", v)}
            />
            <PathField
                label="Key"
                hint="one machine per value; empty: a single machine"
                value={settings.keyPath}
                placeholder=""
                onChange={(v) => onChange("keyPath", v)}
            />
            <CheckLabel style={{ marginTop: 8 }}>
                <CheckboxInput
                    type="checkbox"
                    checked={!!settings.updateAssetState}
                    onChange={(e: { target: { checked: boolean } }) => onChange("updateAssetState", e.target.checked)}
                />
                Show the state in the asset state
            </CheckLabel>
            {settings.updateAssetState && (
                <Note style={{ marginTop: 6 }}>
                    Each change of state is written in the asset state's machines (state, since, previous state), where the
                    Asset state node, Telegram and the AI agents read it. The status of the asset is not changed.
                </Note>
            )}
            <Note style={{ marginTop: 10 }}>
                Output 0: each change of state. Output 1: the time in each state and the number of changes, per period.
            </Note>
        </>
    );
};

// ---- numbers ----

const NumberField: FC<{ label: string; hint?: string; value: number | undefined; fallback: number; min?: number; onChange: (v: number) => void }> = ({
    label,
    hint,
    value,
    fallback,
    min = 0,
    onChange,
}) => (
    <FormGroup>
        <Label>
            {label} {hint && <Hint>({hint})</Hint>}
        </Label>
        <Input
            type="number"
            min={min}
            step="any"
            aria-label={label}
            value={value ?? fallback}
            onChange={(e: { target: { value: string } }) => onChange(Math.max(min, num(e.target.value, fallback)))}
        />
    </FormGroup>
);

// ---- Rainflow ----

export const RainflowSettingsEditor: FC<{ settings: RainflowSettings; onChange: OnChange }> = ({ settings, onChange }) => {
    const source = settings.curveSource ?? "dnv";
    const units = settings.units || "MPa";
    const preset = dnvCurve(settings.dnvCategory ?? "D", settings.dnvEnvironment ?? "air");
    const lines = settings.lines ?? [];
    const setLines = (next: SNLineSetting[]) => onChange("lines", next);
    return (
        <>
            <PathField
                label="Field"
                hint="a number, or an array of samples, per message"
                value={settings.field}
                placeholder="payload.Eps_1"
                onChange={(v) => onChange("field", v)}
            />
            <FormGroup>
                <Label>
                    Scale and units <Hint>(the field times the scale is the stress: e.g. 210000 for a strain → MPa)</Hint>
                </Label>
                <Row>
                    <Input
                        type="number"
                        step="any"
                        aria-label="Scale"
                        value={settings.scale ?? 1}
                        onChange={(e: { target: { value: string } }) => onChange("scale", num(e.target.value, 1))}
                    />
                    <Input
                        type="text"
                        aria-label="Units"
                        value={settings.units ?? "MPa"}
                        style={{ maxWidth: 90 }}
                        onChange={(e: { target: { value: string } }) => onChange("units", e.target.value.trim())}
                    />
                </Row>
            </FormGroup>
            <NumberField label={`Gate (${units})`} hint="reversals smaller than this are ignored as noise" value={settings.gate} fallback={0} onChange={(v) => onChange("gate", v)} />
            <FormGroup>
                <Label>S-N curve</Label>
                <Select
                    aria-label="Curve source"
                    value={source}
                    onChange={(e: { target: { value: string } }) => onChange("curveSource", e.target.value)}
                >
                    <option value="dnv">DNV-RP-C203 category</option>
                    <option value="custom">custom lines</option>
                </Select>
            </FormGroup>
            {source === "dnv" ? (
                <>
                    <Row>
                        <Select
                            aria-label="DNV category"
                            value={settings.dnvCategory ?? "D"}
                            onChange={(e: { target: { value: string } }) => onChange("dnvCategory", e.target.value)}
                        >
                            {DNV_CATEGORIES.map((c) => (
                                <option key={c} value={c}>
                                    {c}
                                </option>
                            ))}
                        </Select>
                        <Select
                            aria-label="DNV environment"
                            value={settings.dnvEnvironment ?? "air"}
                            onChange={(e: { target: { value: string } }) => onChange("dnvEnvironment", e.target.value)}
                        >
                            <option value="air">in air</option>
                            <option value="seawater_cp">seawater, cathodic protection</option>
                        </Select>
                    </Row>
                    {preset && (
                        <Note>
                            m₁ = {preset.lines[0].m}, log a₁ = {preset.lines[0].logA}; m₂ = 5, log a₂ = {preset.lines[1].logA}; knee
                            at {preset.kneeCycles.toExponential(0)} cycles ({preset.kneeRange.toFixed(2)} MPa); k = {preset.k}.{" "}
                            <a
                                href="#"
                                style={{ color: "#8ab4f8" }}
                                onClick={(e) => {
                                    e.preventDefault();
                                    onChange("lines", preset.lines);
                                    onChange("k", preset.k);
                                    onChange("curveSource", "custom");
                                }}
                            >
                                Copy to a custom curve
                            </a>
                        </Note>
                    )}
                </>
            ) : (
                <FormGroup>
                    {lines.map((line, i) => (
                        <Row key={i}>
                            <Small>log N =</Small>
                            <Input
                                type="number"
                                step="any"
                                aria-label={`Line ${i + 1} log a`}
                                value={line.logA ?? ""}
                                onChange={(e: { target: { value: string } }) =>
                                    setLines(lines.map((l, j) => (j === i ? { ...l, logA: e.target.value } : l)))
                                }
                            />
                            <Small>− m · log S, m =</Small>
                            <Input
                                type="number"
                                step="any"
                                aria-label={`Line ${i + 1} m`}
                                value={line.m ?? ""}
                                onChange={(e: { target: { value: string } }) =>
                                    setLines(lines.map((l, j) => (j === i ? { ...l, m: e.target.value } : l)))
                                }
                            />
                            <RemoveButton type="button" aria-label={`Remove line ${i + 1}`} onClick={() => setLines(lines.filter((_, j) => j !== i))}>
                                <Trash2 size={14} />
                            </RemoveButton>
                        </Row>
                    ))}
                    <Button variant="secondary" onClick={() => setLines([...lines, { m: 3, logA: 12 }])}>
                        + Add line
                    </Button>
                    <Note style={{ marginTop: 8 }}>
                        With several lines, each range takes the one that gives most cycles (a two-slope curve: the steep line
                        above the knee, the flat one below it).
                    </Note>
                </FormGroup>
            )}
            <FormGroup>
                <Label>
                    Corrections <Hint>(SCF, thickness t and t_ref in mm with exponent k, cutoff, DFF)</Hint>
                </Label>
                <Row>
                    <Small>SCF</Small>
                    <Input type="number" step="any" min="0" aria-label="SCF" value={settings.scf ?? 1} onChange={(e: { target: { value: string } }) => onChange("scf", Math.max(0, num(e.target.value, 1)))} />
                    <Small>t</Small>
                    <Input type="number" step="any" min="0" aria-label="Thickness" value={settings.thickness ?? 0} onChange={(e: { target: { value: string } }) => onChange("thickness", Math.max(0, num(e.target.value)))} />
                    <Small>t_ref</Small>
                    <Input type="number" step="any" min="0" aria-label="Reference thickness" value={settings.tRef ?? 25} onChange={(e: { target: { value: string } }) => onChange("tRef", Math.max(0, num(e.target.value, 25)))} />
                </Row>
                <Row>
                    <Small>k</Small>
                    <Input
                        type="text"
                        aria-label="Thickness exponent"
                        value={settings.k ?? ""}
                        placeholder={source === "dnv" && preset ? `${preset.k} (preset)` : "0"}
                        onChange={(e: { target: { value: string } }) => onChange("k", e.target.value.trim())}
                    />
                    <Small>cutoff</Small>
                    <Input type="number" step="any" min="0" aria-label="Cutoff" value={settings.cutoff ?? 0} onChange={(e: { target: { value: string } }) => onChange("cutoff", Math.max(0, num(e.target.value)))} />
                    <Small>DFF</Small>
                    <Input type="number" step="any" min="0" aria-label="DFF" value={settings.dff ?? 1} onChange={(e: { target: { value: string } }) => onChange("dff", Math.max(0, num(e.target.value, 1)))} />
                </Row>
            </FormGroup>
            <NumberField label={`Histogram bin (${units})`} value={settings.binWidth} fallback={10} min={0.000001} onChange={(v) => onChange("binWidth", v)} />
            <NumberField label="Design life (years)" hint="to compare the damage rate with; 0: not set" value={settings.designLifeYears} fallback={0} onChange={(v) => onChange("designLifeYears", v)} />
            <NumberField label="Summary every (min)" hint="besides the one at the end of each day; 0: only then" value={settings.summaryEveryMinutes} fallback={0} onChange={(v) => onChange("summaryEveryMinutes", v)} />
            <PathField label="Time zone" hint="of the days; empty: the group's" value={settings.timezone} placeholder="Atlantic/Canary" onChange={(v) => onChange("timezone", v)} />
            <PathField label="Key" hint="one count per value, e.g. per gauge; empty: one" value={settings.keyPath} placeholder="" onChange={(v) => onChange("keyPath", v)} />
            <PathField
                label="Timestamp field"
                hint="places each message in its day (ISO 8601 or epoch ms/s); empty: arrival time"
                value={settings.timePath ?? "payload.timestamp"}
                placeholder="payload.timestamp"
                onChange={(v) => onChange("timePath", v)}
            />
            <Note style={{ marginTop: 10 }}>
                Output: per day, the cycles, histogram and damage, and the totals since the start (damage, life consumed,
                damage rate and remaining life). The total damage is kept until a reset.
            </Note>
        </>
    );
};

// ---- Vibration ----

export const VibrationSettingsEditor: FC<{ settings: VibrationSettings; onChange: OnChange }> = ({ settings, onChange }) => {
    const mode = settings.mode ?? "stream";
    const bands = settings.bands ?? [];
    const setBands = (next: VibrationBand[]) => onChange("bands", next);
    return (
        <>
            <FormGroup>
                <Label>Input</Label>
                <Select aria-label="Vibration mode" value={mode} onChange={(e: { target: { value: string } }) => onChange("mode", e.target.value)}>
                    <option value="stream">single values, gathered into windows</option>
                    <option value="block">a block (array of samples) per message</option>
                </Select>
            </FormGroup>
            <PathField
                label="Field"
                hint={mode === "block" ? "the array of samples" : "the value"}
                value={settings.field}
                placeholder={mode === "block" ? "payload.samples" : "payload.Ay"}
                onChange={(v) => onChange("field", v)}
            />
            <NumberField label="Sampling rate (Hz)" value={settings.fs} fallback={0} onChange={(v) => onChange("fs", v)} />
            {mode === "block" ? (
                <PathField label="Sampling rate field" hint="optional: when the message carries it" value={settings.fsPath} placeholder="payload.fs" onChange={(v) => onChange("fsPath", v)} />
            ) : (
                <Row>
                    <NumberField label="Window (samples)" value={settings.windowSamples} fallback={256} min={16} onChange={(v) => onChange("windowSamples", Math.round(v))} />
                    <NumberField label="Step (samples)" hint="0: the window" value={settings.hopSamples} fallback={0} onChange={(v) => onChange("hopSamples", Math.round(v))} />
                </Row>
            )}
            <FormGroup>
                <Label>
                    Bands <Hint>(RMS in each, from the spectrum)</Hint>
                </Label>
                {bands.map((b, i) => (
                    <Row key={i}>
                        <Input type="text" aria-label={`Band ${i + 1} name`} value={b.name ?? ""} placeholder="name" onChange={(e: { target: { value: string } }) => setBands(bands.map((x, j) => (j === i ? { ...x, name: e.target.value.trim() } : x)))} />
                        <Input type="number" step="any" aria-label={`Band ${i + 1} from`} value={b.from ?? 0} onChange={(e: { target: { value: string } }) => setBands(bands.map((x, j) => (j === i ? { ...x, from: num(e.target.value) } : x)))} />
                        <Small>to</Small>
                        <Input type="number" step="any" aria-label={`Band ${i + 1} to`} value={b.to ?? 0} onChange={(e: { target: { value: string } }) => setBands(bands.map((x, j) => (j === i ? { ...x, to: num(e.target.value) } : x)))} />
                        <Small>Hz</Small>
                        <RemoveButton type="button" aria-label={`Remove band ${i + 1}`} onClick={() => setBands(bands.filter((_, j) => j !== i))}>
                            <Trash2 size={14} />
                        </RemoveButton>
                    </Row>
                ))}
                <Button variant="secondary" onClick={() => setBands([...bands, { name: "", from: 0, to: 1 }])}>
                    + Add band
                </Button>
            </FormGroup>
            <FormGroup>
                <Label>
                    Dominant frequency search <Hint>(Hz; 0: the whole band)</Hint>
                </Label>
                <Row>
                    <Small>from</Small>
                    <Input type="number" step="any" min="0" aria-label="Search from" value={settings.minFreq ?? 0} onChange={(e: { target: { value: string } }) => onChange("minFreq", Math.max(0, num(e.target.value)))} />
                    <Small>to</Small>
                    <Input type="number" step="any" min="0" aria-label="Search to" value={settings.maxFreq ?? 0} onChange={(e: { target: { value: string } }) => onChange("maxFreq", Math.max(0, num(e.target.value)))} />
                </Row>
            </FormGroup>
            <CheckLabel>
                <CheckboxInput type="checkbox" checked={!!settings.velocity} onChange={(e: { target: { checked: boolean } }) => onChange("velocity", e.target.checked)} />
                Velocity RMS of an acceleration (mm/s, ISO 10816/20816)
            </CheckLabel>
            {settings.velocity && (
                <Row style={{ marginTop: 8 }}>
                    <Input type="number" step="any" aria-label="Velocity from" value={settings.velocityFrom ?? 10} onChange={(e: { target: { value: string } }) => onChange("velocityFrom", num(e.target.value, 10))} />
                    <Small>to</Small>
                    <Input type="number" step="any" aria-label="Velocity to" value={settings.velocityTo ?? 1000} onChange={(e: { target: { value: string } }) => onChange("velocityTo", num(e.target.value, 1000))} />
                    <Small>Hz, in</Small>
                    <Select aria-label="Acceleration unit" value={settings.accelUnit ?? "m/s2"} onChange={(e: { target: { value: string } }) => onChange("accelUnit", e.target.value)}>
                        <option value="m/s2">m/s²</option>
                        <option value="g">g</option>
                    </Select>
                </Row>
            )}
            <CheckLabel style={{ marginTop: 8 }}>
                <CheckboxInput type="checkbox" checked={!!settings.includePeaks} onChange={(e: { target: { checked: boolean } }) => onChange("includePeaks", e.target.checked)} />
                Include the five main peaks (frequency, level, damping)
            </CheckLabel>
            <PathField label="Key" hint="one buffer per value, e.g. per sensor; empty: one" value={settings.keyPath} placeholder="" onChange={(v) => onChange("keyPath", v)} />
            <Note style={{ marginTop: 10 }}>
                Output, per block or window: rms, peak, peak-to-peak, crest factor, kurtosis, skewness, shape and impulse
                factors, the dominant frequency with its damping, the bands and the velocity. Streams keep at most{" "}
                {32768} samples per key.
            </Note>
        </>
    );
};

// ---- Anomaly ----

export const AnomalySettingsEditor: FC<{ settings: AnomalySettings; onChange: OnChange }> = ({ settings, onChange }) => {
    const method = settings.method ?? "zscore";
    return (
        <>
            <PathField label="Field" hint="the value judged" value={settings.field} placeholder="payload.Eps_1" onChange={(v) => onChange("field", v)} />
            <FormGroup>
                <Label>Method</Label>
                <Select aria-label="Anomaly method" value={method} onChange={(e: { target: { value: string } }) => onChange("method", e.target.value)}>
                    <option value="zscore">Z-score: distance to the window's mean (spikes)</option>
                    <option value="ewma">EWMA chart: small persistent shifts (drift)</option>
                    <option value="iqr">IQR: Tukey fences (skewed data, robust)</option>
                </Select>
            </FormGroup>
            {method !== "ewma" && (
                <NumberField label="Window (samples)" hint={`the baseline: the latest normal samples, up to ${ANOMALY_MAX_WINDOW}`} value={settings.window} fallback={100} min={4} onChange={(v) => onChange("window", Math.round(v))} />
            )}
            <NumberField
                label={method === "iqr" ? "k" : method === "ewma" ? "L (sigmas)" : "Threshold |z|"}
                hint={method === "iqr" ? "fences at Q1 − k·IQR and Q3 + k·IQR; 1.5 usual, 3 extreme" : "3 usual"}
                value={settings.threshold}
                fallback={method === "iqr" ? 1.5 : 3}
                onChange={(v) => onChange("threshold", v)}
            />
            {method === "ewma" && (
                <>
                    <NumberField label="Lambda" hint="weight of the newest sample: 0.05–0.25; smaller detects smaller shifts" value={settings.lambda} fallback={0.2} onChange={(v) => onChange("lambda", v)} />
                    <NumberField label="Baseline adaptation" hint="how fast the baseline follows normal samples; 0: frozen after the warm-up" value={settings.adapt} fallback={0} onChange={(v) => onChange("adapt", v)} />
                </>
            )}
            <NumberField label="Warm-up (samples)" hint="learnt before judging" value={settings.warmup} fallback={30} min={2} onChange={(v) => onChange("warmup", Math.round(v))} />
            <CheckLabel>
                <CheckboxInput type="checkbox" checked={!!settings.learnAnomalies} onChange={(e: { target: { checked: boolean } }) => onChange("learnAnomalies", e.target.checked)} />
                Let the anomalous samples into the baseline too
            </CheckLabel>
            <PathField label="Result field" hint="where the verdict goes in the payload" value={settings.resultField} placeholder="anomaly" onChange={(v) => onChange("resultField", v)} />
            <PathField label="Key" hint="one detector per value, e.g. per sensor; empty: one" value={settings.keyPath} placeholder="" onChange={(v) => onChange("keyPath", v)} />
            <CheckLabel>
                <CheckboxInput
                    type="checkbox"
                    checked={!!settings.anomaliesOutput}
                    onChange={(e: { target: { checked: boolean } }) => {
                        onChange("anomaliesOutput", e.target.checked);
                        onChange("numOutputs", anomalyNumOutputs({ anomaliesOutput: e.target.checked }));
                    }}
                />
                Second output (→ 1) with only the anomalies
            </CheckLabel>
            <Note style={{ marginTop: 10 }}>
                Output 0: every message, with payload.{settings.resultField || "anomaly"} = {"{ isAnomaly, score, lower, upper, baseline, message }"}.
                An Alarm node with "equals true" on its isAnomaly makes an alarm of it.
            </Note>
        </>
    );
};

// ---- Pose estimation ----

// A JSON setting edited as text: kept as typed (the node reads JSON text); a value imported as an object is shown formatted
const JsonField: FC<{ label: string; hint: string; value: unknown; placeholder: string; rows?: number; onChange: (v: string) => void }> = ({
    label,
    hint,
    value,
    placeholder,
    rows = 6,
    onChange,
}) => (
    <FormGroup>
        <Label>
            {label} <Hint>({hint})</Hint>
        </Label>
        <TextArea
            aria-label={label}
            rows={rows}
            spellCheck={false}
            value={typeof value === "string" ? value : value === undefined || value === null ? "" : JSON.stringify(value, null, 2)}
            placeholder={placeholder}
            onChange={(e: { target: { value: string } }) => onChange(e.target.value)}
        />
    </FormGroup>
);

export const PoseEstimationSettingsEditor: FC<{ settings: PoseEstimationSettings; onChange: OnChange }> = ({ settings, onChange }) => {
    const mode = settings.mode ?? "camera";
    const smoothing = settings.smoothing ?? true;
    const viewer = settings.viewerOutput ?? true;
    const calibrated = typeof settings.calibration === "string" ? settings.calibration.trim() !== "" : !!settings.calibration;
    return (
        <>
            <FormGroup>
                <Label>Mode</Label>
                <Select aria-label="Pose mode" value={mode} onChange={(e: { target: { value: string } }) => onChange("mode", e.target.value)}>
                    <option value="camera">Camera: the camera moves around a still object (a phone)</option>
                    <option value="object">Object: a still camera films a moving object</option>
                </Select>
            </FormGroup>

            <PathField label="Keypoints" hint="detections of YOLO-pose, or named keypoints" value={settings.inputPath} placeholder="payload.detections" onChange={(v) => onChange("inputPath", v)} />
            <FormGroup>
                <Label>
                    Keypoint names <Hint>(in the model's order, for detections without names)</Hint>
                </Label>
                <ListInput label="Keypoint names" value={settings.keypointNames} placeholder="Blade_1, Blade_2, Blade_3, Hub, ..." onChange={(v) => onChange("keypointNames", v)} />
            </FormGroup>
            <JsonField
                label="Keypoint names by class"
                hint="optional: an object detected as several classes"
                value={settings.keypointNamesByClass}
                placeholder={'{\n  "WindTurbine": ["pontoon_right_3", "pontoon_left_3", ...],\n  "Rotor": ["blade_red_1", "blade_red_2", ...]\n}'}
                rows={4}
                onChange={(v) => onChange("keypointNamesByClass", v)}
            />
            <Row>
                <PathField label="Class" hint="empty: any" value={settings.className} placeholder="" onChange={(v) => onChange("className", v)} />
                <NumberField label="Minimum confidence" value={settings.minConfidence} fallback={0.5} onChange={(v) => onChange("minConfidence", Math.min(1, v))} />
            </Row>

            <JsonField
                label="3D points"
                hint="{name: [x, y, z]} in metres"
                value={settings.points}
                placeholder={'{\n  "Hub": [0.001, 0.306, 1.145],\n  "pilar_center": [0.001, 0.194, 0.788],\n  ...\n}'}
                rows={8}
                onChange={(v) => onChange("points", v)}
            />
            <Row>
                <FormGroup style={{ flex: 1 }}>
                    <Label>Coordinates</Label>
                    <Select aria-label="Points frame" value={settings.pointsFrame ?? "gltf"} onChange={(e: { target: { value: string } }) => onChange("pointsFrame", e.target.value)}>
                        <option value="gltf">glb / viewer (Y up)</option>
                        <option value="blender">Blender (Z up)</option>
                    </Select>
                </FormGroup>
                <NumberField label="Scale" hint="to metres" value={settings.pointsScale} fallback={1} onChange={(v) => onChange("pointsScale", v)} />
            </Row>

            <JsonField
                label="Calibration"
                hint="OpenCV's calibration.json: camera_matrix, dist_coeffs, image size"
                value={settings.calibration}
                placeholder={'{\n  "camera_matrix": [[1000, 0, 640], [0, 1000, 360], [0, 0, 1]],\n  "dist_coeffs": [0.08, -0.15, 0, 0, 0.05],\n  "image_width": 1280,\n  "image_height": 720\n}'}
                onChange={(v) => onChange("calibration", v)}
            />
            {!calibrated && (
                <Row>
                    <NumberField label="Field of view (°)" hint="without calibration: rough" value={settings.fovDeg} fallback={60} onChange={(v) => onChange("fovDeg", v)} />
                    <FormGroup style={{ flex: 1 }}>
                        <Label>Measured on</Label>
                        <Select aria-label="Field of view side" value={settings.fovSide ?? "vertical"} onChange={(e: { target: { value: string } }) => onChange("fovSide", e.target.value)}>
                            <option value="vertical">the vertical side</option>
                            <option value="horizontal">the horizontal side</option>
                            <option value="long">the longer side (portrait or landscape)</option>
                        </Select>
                    </FormGroup>
                </Row>
            )}
            <Row>
                <PathField label="Image width" hint="path" value={settings.imageWidthPath} placeholder="payload.width" onChange={(v) => onChange("imageWidthPath", v)} />
                <PathField label="Image height" hint="path" value={settings.imageHeightPath} placeholder="payload.height" onChange={(v) => onChange("imageHeightPath", v)} />
            </Row>

            <JsonField
                label="Moving parts"
                hint="optional: rotors, sliding parts"
                value={settings.parts}
                placeholder={POSE_PARTS_EXAMPLE}
                rows={8}
                onChange={(v) => onChange("parts", v)}
            />
            <Note>
                A rotor of n alike blades must turn less than 180°/n between frames (60° for 3 blades); with its direction or expected speed (rad/s),
                less than 360°/n. At 2π rad/s and 3 blades: at least 6 frames per second, or 3 with the direction.
            </Note>

            <Row>
                <NumberField label="Inlier threshold (px)" value={settings.inlierThreshold} fallback={8} onChange={(v) => onChange("inlierThreshold", v)} />
                <NumberField label="Minimum points" value={settings.minPoints} fallback={6} min={4} onChange={(v) => onChange("minPoints", Math.round(v))} />
            </Row>

            <CheckLabel>
                <CheckboxInput type="checkbox" checked={smoothing} onChange={(e: { target: { checked: boolean } }) => onChange("smoothing", e.target.checked)} />
                Smooth the pose (Kalman filter)
            </CheckLabel>
            {smoothing && (
                <>
                    <Row>
                        <NumberField label="Position noise (m)" value={settings.positionNoise} fallback={0.01} onChange={(v) => onChange("positionNoise", v)} />
                        <NumberField label="+ × distance" hint="depth is less sure far away" value={settings.positionNoiseRelative} fallback={0.05} onChange={(v) => onChange("positionNoiseRelative", v)} />
                        <NumberField label="Angle noise (°)" value={settings.angleNoiseDeg} fallback={1} onChange={(v) => onChange("angleNoiseDeg", v)} />
                    </Row>
                    <Row>
                        <NumberField label="Max acceleration (m/s²)" value={settings.maxAcceleration} fallback={2} onChange={(v) => onChange("maxAcceleration", v)} />
                        <NumberField label="Max angular accel. (°/s²)" value={settings.maxAngularAccelerationDeg} fallback={180} onChange={(v) => onChange("maxAngularAccelerationDeg", v)} />
                    </Row>
                </>
            )}
            <NumberField label="Reset after (s)" hint="a longer gap without a pose starts the filters again" value={settings.resetAfter} fallback={2} onChange={(v) => onChange("resetAfter", v)} />
            <Row>
                <NumberField label="Max jump (°)" hint="0: no check" value={settings.maxJumpDeg} fallback={30} onChange={(v) => onChange("maxJumpDeg", v)} />
                <NumberField label="Max jump (× distance)" value={settings.maxJump} fallback={0.3} onChange={(v) => onChange("maxJump", v)} />
                <NumberField label="Frames to confirm" value={settings.confirmFrames} fallback={3} min={1} onChange={(v) => onChange("confirmFrames", Math.round(v))} />
            </Row>
            <Note>
                A pose further than that from the previous one is left out (output 1) until as many frames agree: a flipped pose (keypoints nearly on a
                plane have two) or a close-up where the detector bunches the keypoints up lasts a frame or a few. After a gap, the first pose waits for a
                second that agrees.
            </Note>

            <CheckLabel>
                <CheckboxInput type="checkbox" checked={viewer} onChange={(e: { target: { checked: boolean } }) => onChange("viewerOutput", e.target.checked)} />
                Outputs for the 3D viewer (payload.camera, payload.customAnimation)
            </CheckLabel>
            {viewer && mode === "camera" && (
                <CheckLabel>
                    <CheckboxInput type="checkbox" checked={settings.follow ?? true} onChange={(e: { target: { checked: boolean } }) => onChange("follow", e.target.checked)} />
                    The viewer's camera follows (the user's orbit controls are off meanwhile)
                </CheckLabel>
            )}
            {viewer && mode === "object" && (
                <PathField label="Object node" hint="name of the glb node moved like the object" value={settings.objectNodeName} placeholder="" onChange={(v) => onChange("objectNodeName", v)} />
            )}

            <PathField label="Result field" hint="where the pose goes in the payload" value={settings.resultField} placeholder="pose" onChange={(v) => onChange("resultField", v)} />
            <KeyAndTime settings={settings} onChange={onChange} keyHint="one pose per value, e.g. per camera; empty: one" />
            <Note style={{ marginTop: 10 }}>
                Output 0: the frames with a pose, payload.{settings.resultField || "pose"} = {"{ camera | object, parts, inliers, reprojectionError }"}; publish it to
                dtm2sim to move the viewer. Output 1: the frames without a pose, with the reason.
            </Note>
        </>
    );
};

// ---- message time (by default the timestamp that the Listen node adds) ----

const TimestampField: FC<{ value: string | undefined; onChange: OnChange; hint: string }> = ({ value, onChange, hint }) => (
    <PathField
        label="Timestamp field"
        hint={`${hint} (ISO 8601 or epoch ms/s); empty: arrival time`}
        value={value ?? "payload.timestamp"}
        placeholder="payload.timestamp"
        onChange={(v) => onChange("timePath", v)}
    />
);

const SummaryEveryField: FC<{ value: number | undefined; onChange: OnChange; period: string }> = ({ value, onChange, period }) => (
    <FormGroup>
        <Label>
            Summary every (min) <Hint>(besides the one at the end of each {period}; 0: only then)</Hint>
        </Label>
        <Input
            type="number"
            min="0"
            step="1"
            aria-label="Summary every"
            value={value ?? 0}
            onChange={(e: { target: { value: string } }) => onChange("summaryEveryMinutes", Math.max(0, num(e.target.value)))}
        />
    </FormGroup>
);

// ---- Totalizer ----

const TOTALIZER_MODES: { value: string; label: string }[] = [
    { value: "counter", label: "counter (cumulative reading)" },
    { value: "rate", label: "rate (integrated over time)" },
    { value: "events", label: "events (each message adds)" },
];

export const TotalizerSettingsEditor: FC<{ settings: TotalizerSettings; onChange: OnChange }> = ({ settings, onChange }) => {
    const items = settings.items ?? [];
    const setItems = (next: TotalizerItem[]) => onChange("items", next);
    const update = (i: number, change: Partial<TotalizerItem>) => setItems(items.map((it, j) => (j === i ? { ...it, ...change } : it)));
    return (
        <>
            <FormGroup>
                <Label>
                    Items <Hint>(each one adds up a field per day)</Hint>
                </Label>
                {items.map((it, i) => {
                    const mode = it.mode ?? "counter";
                    return (
                        <Card key={i}>
                            <Row>
                                <Input
                                    type="text"
                                    aria-label={`Item ${i + 1} name`}
                                    value={it.name ?? ""}
                                    placeholder="name, e.g. energy"
                                    onChange={(e: { target: { value: string } }) => update(i, { name: e.target.value })}
                                />
                                <Input
                                    type="text"
                                    aria-label={`Item ${i + 1} unit`}
                                    value={it.unit ?? ""}
                                    placeholder="unit"
                                    style={{ maxWidth: 80 }}
                                    onChange={(e: { target: { value: string } }) => update(i, { unit: e.target.value.trim() })}
                                />
                                <RemoveButton type="button" aria-label={`Remove item ${i + 1}`} onClick={() => setItems(items.filter((_, j) => j !== i))}>
                                    <Trash2 size={14} />
                                </RemoveButton>
                            </Row>
                            <Row>
                                <Select
                                    aria-label={`Item ${i + 1} mode`}
                                    value={mode}
                                    onChange={(e: { target: { value: string } }) => update(i, { mode: e.target.value as TotalizerItem["mode"] })}
                                >
                                    {TOTALIZER_MODES.map((m) => (
                                        <option key={m.value} value={m.value}>
                                            {m.label}
                                        </option>
                                    ))}
                                </Select>
                                <Input
                                    type="text"
                                    aria-label={`Item ${i + 1} field`}
                                    value={it.field ?? ""}
                                    placeholder={mode === "events" ? "empty: 1 per message" : "payload.value"}
                                    onChange={(e: { target: { value: string } }) => update(i, { field: e.target.value.trim() })}
                                />
                            </Row>
                            <Row style={{ marginBottom: 0 }}>
                                <Small>× factor</Small>
                                <Input
                                    type="number"
                                    step="any"
                                    aria-label={`Item ${i + 1} factor`}
                                    value={it.factor ?? 1}
                                    onChange={(e: { target: { value: string } }) => update(i, { factor: num(e.target.value, 1) })}
                                />
                                {mode === "counter" && (
                                    <>
                                        <Small>rollover at</Small>
                                        <Input
                                            type="number"
                                            min="0"
                                            step="any"
                                            aria-label={`Item ${i + 1} rollover`}
                                            title="the value after which the counter starts again from 0 (e.g. 4294967295); 0: none"
                                            value={it.rolloverAt ?? 0}
                                            onChange={(e: { target: { value: string } }) => update(i, { rolloverAt: Math.max(0, num(e.target.value)) })}
                                        />
                                        <Small>max step</Small>
                                        <Input
                                            type="number"
                                            min="0"
                                            step="any"
                                            aria-label={`Item ${i + 1} maximum step`}
                                            title="larger increases are a meter change or a spike and are not counted; 0: no limit"
                                            value={it.maxStep ?? 0}
                                            onChange={(e: { target: { value: string } }) => update(i, { maxStep: Math.max(0, num(e.target.value)) })}
                                        />
                                    </>
                                )}
                                {mode === "rate" && (
                                    <>
                                        <Small>per</Small>
                                        <Select
                                            aria-label={`Item ${i + 1} rate time unit`}
                                            value={it.rateTimeUnit ?? "h"}
                                            onChange={(e: { target: { value: string } }) => update(i, { rateTimeUnit: e.target.value as TotalizerItem["rateTimeUnit"] })}
                                        >
                                            <option value="s">second</option>
                                            <option value="min">minute</option>
                                            <option value="h">hour</option>
                                            <option value="d">day</option>
                                        </Select>
                                        <Small>max gap (s)</Small>
                                        <Input
                                            type="number"
                                            min="0"
                                            step="1"
                                            aria-label={`Item ${i + 1} maximum gap`}
                                            title="longer gaps between readings are not integrated; 0: no limit"
                                            value={it.maxGapSeconds ?? 0}
                                            onChange={(e: { target: { value: string } }) => update(i, { maxGapSeconds: Math.max(0, num(e.target.value)) })}
                                        />
                                    </>
                                )}
                            </Row>
                        </Card>
                    );
                })}
                <Button
                    variant="secondary"
                    onClick={() => setItems([...items, { name: "", field: "payload.value", mode: "counter", unit: "", factor: 1 }])}
                >
                    + Add item
                </Button>
            </FormGroup>
            <Note>
                Counter: the increase between readings (a decrease is a rollover or a counter that restarted). Rate: e.g. kW per
                hour gives kWh. Events: pieces, starts, cycles.
            </Note>
            <SummaryEveryField value={settings.summaryEveryMinutes} onChange={onChange} period="day" />
            <TimestampField value={settings.timePath} onChange={onChange} hint="places each message in its day" />
            <PathField label="Time zone" hint="of the days; empty: the group's" value={settings.timezone} placeholder="Atlantic/Canary" onChange={(v) => onChange("timezone", v)} />
            <PathField label="Key" hint="one total per value, e.g. per meter; empty: one" value={settings.keyPath} placeholder="" onChange={(v) => onChange("keyPath", v)} />
            <Note style={{ marginTop: 10 }}>
                Output 0: the amounts of each day and the totals since the start, per item (payload.values.&lt;name&gt;).
            </Note>
        </>
    );
};

// ---- OEE ----

const WEEK_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const OeeSettingsEditor: FC<{ settings: OeeSettings; onChange: OnChange }> = ({ settings, onChange }) => {
    const nonWorking = settings.nonWorkingDays ?? [];
    return (
        <>
            <FormGroup>
                <Label>
                    Machine state <Hint>(field and time of the state changes: those of a Machine state node by default)</Hint>
                </Label>
                <Row style={{ marginBottom: 0 }}>
                    <Input
                        type="text"
                        aria-label="State field"
                        value={settings.stateField ?? "payload.state"}
                        placeholder="payload.state"
                        onChange={(e: { target: { value: string } }) => onChange("stateField", e.target.value.trim())}
                    />
                    <Small>since</Small>
                    <Input
                        type="text"
                        aria-label="State time field"
                        value={settings.stateTimePath ?? "payload.since"}
                        placeholder="payload.since"
                        onChange={(e: { target: { value: string } }) => onChange("stateTimePath", e.target.value.trim())}
                    />
                </Row>
            </FormGroup>
            <FormGroup>
                <Label>
                    Production states <Hint>(run time; comma separated)</Hint>
                </Label>
                <ListInput label="Production states" value={settings.productionStates} placeholder="Running" onChange={(v) => onChange("productionStates", v)} />
            </FormGroup>
            <FormGroup>
                <Label>
                    Planned stop states <Hint>(left out of the planned time, e.g. Changeover, Cleaning)</Hint>
                </Label>
                <ListInput label="Planned stop states" value={settings.plannedStopStates} placeholder="Cleaning, Planned maintenance" onChange={(v) => onChange("plannedStopStates", v)} />
            </FormGroup>
            <CheckLabel style={{ marginBottom: 12 }}>
                <CheckboxInput type="checkbox" checked={!!settings.unknownExcluded} onChange={(e: { target: { checked: boolean } }) => onChange("unknownExcluded", e.target.checked)} />
                Leave the Unknown state out (instead of counting it as downtime)
            </CheckLabel>
            <FormGroup>
                <Label>
                    Pieces <Hint>(fields of the total, good and rejected pieces; the empty ones are derived)</Hint>
                </Label>
                <Row>
                    <Input type="text" aria-label="Total pieces field" value={settings.totalField ?? ""} placeholder="total: payload.pieces" onChange={(e: { target: { value: string } }) => onChange("totalField", e.target.value.trim())} />
                    <Input type="text" aria-label="Good pieces field" value={settings.goodField ?? ""} placeholder="good" onChange={(e: { target: { value: string } }) => onChange("goodField", e.target.value.trim())} />
                    <Input type="text" aria-label="Rejected pieces field" value={settings.rejectField ?? ""} placeholder="rejected" onChange={(e: { target: { value: string } }) => onChange("rejectField", e.target.value.trim())} />
                </Row>
                <Select aria-label="Count mode" value={settings.countMode ?? "increment"} onChange={(e: { target: { value: string } }) => onChange("countMode", e.target.value)}>
                    <option value="increment">each message brings the pieces made since the last one</option>
                    <option value="cumulative">the fields are cumulative counters</option>
                </Select>
            </FormGroup>
            <NumberField label="Ideal cycle time (s)" hint="per piece, at nominal speed" value={settings.idealCycleSeconds} fallback={60} onChange={(v) => onChange("idealCycleSeconds", v)} />
            <FormGroup>
                <Label>
                    Shifts <Hint>(start times HH:MM, comma separated; empty: the calendar day)</Hint>
                </Label>
                <ListInput label="Shifts" value={settings.shifts} placeholder="06:00, 14:00, 22:00" onChange={(v) => onChange("shifts", v)} />
            </FormGroup>
            <FormGroup>
                <Label>
                    Breaks <Hint>(every working day, HH:MM-HH:MM, comma separated)</Hint>
                </Label>
                <ListInput label="Breaks" value={settings.breaks} placeholder="10:00-10:15, 13:30-14:00" onChange={(v) => onChange("breaks", v)} />
            </FormGroup>
            <FormGroup>
                <Label>Non-working days</Label>
                <Checks>
                    {WEEK_DAYS.map((day, i) => (
                        <CheckLabel key={day}>
                            <CheckboxInput
                                type="checkbox"
                                checked={nonWorking.includes(i)}
                                onChange={(e: { target: { checked: boolean } }) =>
                                    onChange("nonWorkingDays", e.target.checked ? [...nonWorking, i].sort() : nonWorking.filter((d) => d !== i))
                                }
                            />
                            {day}
                        </CheckLabel>
                    ))}
                </Checks>
            </FormGroup>
            <FormGroup>
                <Label>
                    Holidays <Hint>(YYYY-MM-DD, comma separated)</Hint>
                </Label>
                <ListInput label="Holidays" value={settings.holidays} placeholder="2026-12-25, 2027-01-01" onChange={(v) => onChange("holidays", v)} />
            </FormGroup>
            <Note>
                In breaks, non-working days and holidays a stopped machine is not a loss; if it produces, that time counts as run
                time.
            </Note>
            <SummaryEveryField value={settings.summaryEveryMinutes} onChange={onChange} period="shift or day" />
            <TimestampField value={settings.timePath} onChange={onChange} hint="of the pieces" />
            <PathField label="Time zone" hint="of the days, shifts and calendar; empty: the group's" value={settings.timezone} placeholder="Atlantic/Canary" onChange={(v) => onChange("timezone", v)} />
            <PathField label="Key" hint="one machine per value; empty: a single machine" value={settings.keyPath} placeholder="" onChange={(v) => onChange("keyPath", v)} />
            <Note style={{ marginTop: 10 }}>
                Output 0: per shift or day, oee, availability, performance and quality (%), times (s), pieces and losses.
            </Note>
        </>
    );
};

// ---- Degradation ----

export const DegradationSettingsEditor: FC<{ settings: DegradationSettings; onChange: OnChange; topicRefs: string[] }> = ({
    settings,
    onChange,
    topicRefs,
}) => {
    const historyRefs = Array.from(new Set([...topicRefs.filter((r) => r.startsWith("dev2pdb")), "dtm2pdb"]));
    const history = settings.historyTopicRef ?? "";
    return (
        <>
            <PathField
                label="Health indicator"
                hint="a number that gets worse with wear, e.g. the RMS of a Vibration node"
                value={settings.field}
                placeholder="payload.value"
                onChange={(v) => onChange("field", v)}
            />
            <FormGroup>
                <Label>Failure threshold</Label>
                <Row style={{ marginBottom: 0 }}>
                    <Select aria-label="Direction" value={settings.direction ?? "rising"} onChange={(e: { target: { value: string } }) => onChange("direction", e.target.value)}>
                        <option value="rising">rises towards</option>
                        <option value="falling">falls towards</option>
                    </Select>
                    <Input
                        type="number"
                        step="any"
                        aria-label="Failure threshold"
                        value={settings.threshold ?? ""}
                        onChange={(e: { target: { value: string } }) => onChange("threshold", e.target.value === "" ? "" : num(e.target.value))}
                    />
                </Row>
            </FormGroup>
            <FormGroup>
                <Label>
                    Healthy value <Hint>(100 % of the health index; empty: the oldest value kept)</Hint>
                </Label>
                <Input
                    type="number"
                    step="any"
                    aria-label="Healthy value"
                    value={settings.baseline ?? ""}
                    onChange={(e: { target: { value: string } }) => onChange("baseline", e.target.value === "" ? "" : num(e.target.value))}
                />
            </FormGroup>
            <FormGroup>
                <Label>Trend</Label>
                <Row style={{ marginBottom: 0 }}>
                    <Select aria-label="Model" value={settings.model ?? "linear"} onChange={(e: { target: { value: string } }) => onChange("model", e.target.value)}>
                        <option value="linear">linear</option>
                        <option value="exponential">exponential (values &gt; 0)</option>
                    </Select>
                    <Small>of the means per</Small>
                    <Select aria-label="Bucket" value={settings.bucket ?? "hour"} onChange={(e: { target: { value: string } }) => onChange("bucket", e.target.value)}>
                        <option value="hour">hour</option>
                        <option value="day">day</option>
                    </Select>
                </Row>
            </FormGroup>
            <NumberField label="Trend window (days)" hint="the latest days the trend is fitted on" value={settings.windowDays} fallback={30} onChange={(v) => onChange("windowDays", v)} />
            <NumberField label="Minimum points" hint="buckets needed for an estimate" value={settings.minPoints} fallback={10} min={3} onChange={(v) => onChange("minPoints", Math.round(v))} />
            <FormGroup>
                <Label>
                    History at start <Hint>(stored messages of a topic, loaded once from the IoT database)</Hint>
                </Label>
                <Row style={{ marginBottom: 0 }}>
                    <Select aria-label="History topic" value={history} onChange={(e: { target: { value: string } }) => onChange("historyTopicRef", e.target.value)}>
                        <option value="">none</option>
                        {historyRefs.map((ref) => (
                            <option key={ref} value={ref}>
                                {ref}
                            </option>
                        ))}
                    </Select>
                    {history !== "" && (
                        <Input
                            type="text"
                            aria-label="History field"
                            value={settings.historyField ?? ""}
                            placeholder={`field there: ${(settings.field || "payload.value").replace(/^payload\./, "")}`}
                            onChange={(e: { target: { value: string } }) => onChange("historyField", e.target.value.trim())}
                        />
                    )}
                </Row>
            </FormGroup>
            {history !== "" && (
                <Note>
                    Up to the trend window, never beyond the data retention of the IoT database. It is loaded once; after a reset
                    (e.g. the part was replaced) it is not loaded again.
                </Note>
            )}
            <TimestampField value={settings.timePath} onChange={onChange} hint="places each sample in its bucket" />
            <PathField label="Time zone" hint="of the buckets; empty: the group's" value={settings.timezone} placeholder="Atlantic/Canary" onChange={(v) => onChange("timezone", v)} />
            <PathField label="Key" hint="one trend per value, e.g. per bearing; empty: one" value={settings.keyPath} placeholder="" onChange={(v) => onChange("keyPath", v)} />
            <Note style={{ marginTop: 10 }}>
                Output 0: an estimate each time a bucket closes: status, rulDays (with rulLowDays–rulHighDays), failureDate and
                healthPercent.
            </Note>
        </>
    );
};

// ---- Approval ----

export const ApprovalSettingsEditor: FC<{ settings: ApprovalSettings; onChange: OnChange }> = ({ settings, onChange }) => {
    const channel = settings.channel ?? "viewer";
    return (
        <>
            <FormGroup>
                <Label>
                    Decided from <Hint>(only by the group's administrators)</Hint>
                </Label>
                <Select aria-label="Channel" value={channel} onChange={(e: { target: { value: string } }) => onChange("channel", e.target.value)}>
                    <option value="viewer">the Approvals page (home page)</option>
                    <option value="telegram">Telegram (Approve / Reject buttons)</option>
                    <option value="both">both</option>
                </Select>
            </FormGroup>
            {channel !== "viewer" && (
                <>
                    <PathField
                        label="Telegram chat id"
                        hint="where the requests are sent; negative for groups"
                        value={settings.chatId}
                        placeholder="-1001234567890"
                        onChange={(v) => onChange("chatId", v)}
                    />
                    <Note>
                        Only administrators whose Telegram account is linked in their profile can decide from Telegram.
                    </Note>
                </>
            )}
            <PathField label="Title" hint="what is asked" value={settings.title} placeholder="Approval request" onChange={(v) => onChange("title", v)} />
            <PathField
                label="Detail field"
                hint="shown with the request, e.g. the command to send"
                value={settings.detailField}
                placeholder="payload.command"
                onChange={(v) => onChange("detailField", v)}
            />
            <NumberField label="Expires after (min)" hint="0: never" value={settings.timeoutMinutes} fallback={60} onChange={(v) => onChange("timeoutMinutes", v)} />
            <PathField label="Time zone" hint="of the times in Telegram; empty: the group's" value={settings.timezone} placeholder="Atlantic/Canary" onChange={(v) => onChange("timezone", v)} />
            <Note style={{ marginTop: 10 }}>
                Outputs: 0 approved, 1 rejected, 2 expired (the original message, with payload.approval: decision, by, via,
                comment), 3 a notice of each new request (to wire to Email or Telegram).
            </Note>
        </>
    );
};

// ---- the Settings tab content of a signal node ----

export const SignalNodeSettings: FC<{
    type: SignalNodeType;
    formData: Record<string, any>;
    onChange: OnChange;
    topicRefs: string[];
}> = ({ type, formData, onChange, topicRefs }) => {
    const problems = signalProblems(type, formData);
    return (
        <>
            {problems.length > 0 && (
                <Problems role="alert">
                    {problems.map((p) => (
                        <div key={p}>{p}</div>
                    ))}
                </Problems>
            )}
            {type === "Switch" && <SwitchSettingsEditor settings={formData} onChange={onChange} />}
            {type === "Deadband" && <DeadbandSettingsEditor settings={formData} onChange={onChange} />}
            {type === "Window" && <WindowSettingsEditor settings={formData} onChange={onChange} />}
            {type === "Join" && <JoinSettingsEditor settings={formData} onChange={onChange} topicRefs={topicRefs} />}
            {type === "Watchdog" && <WatchdogSettingsEditor settings={formData} onChange={onChange} topicRefs={topicRefs} />}
            {type === "Alarm" && <AlarmSettingsEditor settings={formData} onChange={onChange} />}
            {type === "MachineState" && <MachineStateSettingsEditor settings={formData} onChange={onChange} />}
            {type === "Rainflow" && <RainflowSettingsEditor settings={formData} onChange={onChange} />}
            {type === "Vibration" && <VibrationSettingsEditor settings={formData} onChange={onChange} />}
            {type === "Anomaly" && <AnomalySettingsEditor settings={formData} onChange={onChange} />}
            {type === "PoseEstimation" && <PoseEstimationSettingsEditor settings={formData} onChange={onChange} />}
            {type === "Totalizer" && <TotalizerSettingsEditor settings={formData} onChange={onChange} />}
            {type === "OEE" && <OeeSettingsEditor settings={formData} onChange={onChange} />}
            {type === "Degradation" && <DegradationSettingsEditor settings={formData} onChange={onChange} topicRefs={topicRefs} />}
            {type === "Approval" && <ApprovalSettingsEditor settings={formData} onChange={onChange} />}
            <Note style={{ marginTop: 14 }}>
                {type !== "Switch" && type !== "Approval" && 'A message with payload.reset = true clears the node\'s state (a text: only that key\'s).'}
            </Note>
        </>
    );
};
