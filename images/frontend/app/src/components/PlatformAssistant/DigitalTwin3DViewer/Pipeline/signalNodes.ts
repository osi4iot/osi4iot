// Signal nodes (Switch, Deadband, Window, Join): default settings, number of outputs and the checks that
// pipelines does when deploying (nodes/*Logic.go), so that the editor shows the problems before.

export const SIGNAL_NODE_TYPES = [
    "Switch",
    "Deadband",
    "Window",
    "Join",
    "Watchdog",
    "Alarm",
    "MachineState",
    "Rainflow",
    "Vibration",
    "Anomaly",
    "PoseEstimation",
    "Totalizer",
    "OEE",
    "Degradation",
    "Approval",
] as const;
export type SignalNodeType = (typeof SIGNAL_NODE_TYPES)[number];

export const isSignalNode = (type: string | undefined): type is SignalNodeType =>
    !!type && (SIGNAL_NODE_TYPES as readonly string[]).includes(type);

// ---- Switch ----

export type SwitchOperator =
    | "eq"
    | "neq"
    | "lt"
    | "lte"
    | "gt"
    | "gte"
    | "between"
    | "contains"
    | "regex"
    | "true"
    | "false"
    | "exists"
    | "notExists"
    | "isNumber"
    | "isString";

export const SWITCH_OPERATORS: { value: SwitchOperator; label: string; values: 0 | 1 | 2; numeric?: boolean }[] = [
    { value: "eq", label: "==", values: 1 },
    { value: "neq", label: "!=", values: 1 },
    { value: "lt", label: "<", values: 1, numeric: true },
    { value: "lte", label: "<=", values: 1, numeric: true },
    { value: "gt", label: ">", values: 1, numeric: true },
    { value: "gte", label: ">=", values: 1, numeric: true },
    { value: "between", label: "between", values: 2, numeric: true },
    { value: "contains", label: "contains", values: 1 },
    { value: "regex", label: "matches regex", values: 1 },
    { value: "true", label: "is true", values: 0 },
    { value: "false", label: "is false", values: 0 },
    { value: "exists", label: "exists", values: 0 },
    { value: "notExists", label: "does not exist", values: 0 },
    { value: "isNumber", label: "is a number", values: 0 },
    { value: "isString", label: "is a text", values: 0 },
];

export interface SwitchRule {
    operator: SwitchOperator;
    value?: string;
    value2?: string;
}

export interface SwitchSettings {
    property?: string;
    checkMode?: "first" | "all";
    otherwise?: boolean;
    rules?: SwitchRule[];
}

export const switchNumOutputs = (s: SwitchSettings) => (s.rules?.length ?? 0) + (s.otherwise ? 1 : 0);

const isNumberText = (v: string | undefined) => v !== undefined && v.trim() !== "" && Number.isFinite(Number(v));

export const switchProblems = (s: SwitchSettings): string[] => {
    const problems: string[] = [];
    const rules = s.rules ?? [];
    if (rules.length === 0) problems.push("At least one rule is required.");
    rules.forEach((rule, i) => {
        const op = SWITCH_OPERATORS.find((o) => o.value === rule.operator);
        if (!op) {
            problems.push(`Rule ${i + 1}: choose an operator.`);
            return;
        }
        if (op.value === "between") {
            if (!isNumberText(rule.value) || !isNumberText(rule.value2))
                problems.push(`Rule ${i + 1}: between needs two numbers.`);
        } else if (op.numeric && !isNumberText(rule.value)) {
            problems.push(`Rule ${i + 1}: "${rule.value ?? ""}" is not a number.`);
        } else if (op.value === "regex") {
            try {
                new RegExp(rule.value ?? "");
            } catch {
                problems.push(`Rule ${i + 1}: invalid regular expression.`);
            }
        }
    });
    return problems;
};

// ---- Deadband ----

export interface DeadbandSettings {
    fields?: string[];
    bandType?: "absolute" | "percent";
    band?: number;
    maxIntervalSeconds?: number;
    keyPath?: string;
    timePath?: string;
    blockedOutput?: boolean;
}

export const deadbandNumOutputs = (s: DeadbandSettings) => (s.blockedOutput ? 2 : 1);

export const deadbandProblems = (s: DeadbandSettings): string[] => {
    const problems: string[] = [];
    if (!(s.fields ?? []).some((f) => f.trim() !== "")) problems.push("At least one field is required.");
    if ((s.band ?? 0) < 0) problems.push("The band cannot be negative.");
    if ((s.maxIntervalSeconds ?? 0) < 0) problems.push("The maximum interval cannot be negative.");
    return problems;
};

// ---- Window ----

export const WINDOW_MAX_SAMPLES = 5000;

export const WINDOW_STATS: { value: string; label: string; samples?: boolean }[] = [
    { value: "count", label: "count" },
    { value: "sum", label: "sum" },
    { value: "mean", label: "mean" },
    { value: "min", label: "min" },
    { value: "max", label: "max" },
    { value: "first", label: "first" },
    { value: "last", label: "last" },
    { value: "range", label: "range" },
    { value: "rms", label: "RMS" },
    { value: "std", label: "std. dev." },
    { value: "p50", label: "p50", samples: true },
    { value: "p90", label: "p90", samples: true },
    { value: "p95", label: "p95", samples: true },
    { value: "p99", label: "p99", samples: true },
];

export interface WindowSettings {
    fields?: string[];
    windowType?: "count" | "time";
    size?: number;
    durationSeconds?: number;
    mode?: "tumbling" | "sliding";
    stats?: string[];
    keyPath?: string;
    timePath?: string;
}

// Whether the window keeps its samples (sliding, percentiles): capped at WINDOW_MAX_SAMPLES per key.
export const windowKeepsSamples = (s: WindowSettings) =>
    s.mode === "sliding" || (s.stats ?? []).some((st) => WINDOW_STATS.find((w) => w.value === st)?.samples);

export const windowProblems = (s: WindowSettings): string[] => {
    const problems: string[] = [];
    if (!(s.fields ?? []).some((f) => f.trim() !== "")) problems.push("At least one numeric field is required.");
    if ((s.windowType ?? "count") === "count") {
        if (!Number.isInteger(s.size) || (s.size ?? 0) < 1) problems.push("The window size must be at least 1.");
        if (s.mode === "sliding" && (s.size ?? 0) > WINDOW_MAX_SAMPLES)
            problems.push(`A sliding window keeps at most ${WINDOW_MAX_SAMPLES} messages.`);
    } else if ((s.durationSeconds ?? 0) < 1) {
        problems.push("The window duration must be at least 1 second.");
    }
    if ((s.stats ?? []).length === 0) problems.push("Choose at least one statistic.");
    return problems;
};

// ---- Join ----

export interface JoinSource {
    topicRef?: string; // a topic of the digital twin (resolved by pipelines)
    key?: string; // or the raw value of the key path
    alias?: string;
}

export interface JoinSettings {
    keyPath?: string;
    valuePath?: string;
    sources?: JoinSource[];
    mode?: "latest" | "all" | "set";
    maxAgeSeconds?: number;
    timeoutSeconds?: number;
    output?: "nested" | "flat";
    timePath?: string;
}

export const joinSourceAlias = (s: JoinSource) => (s.alias?.trim() || s.topicRef || s.key || "").trim();

export const joinProblems = (s: JoinSettings): string[] => {
    const problems: string[] = [];
    const sources = s.sources ?? [];
    const keys = new Set<string>();
    const aliases = new Set<string>();
    sources.forEach((src, i) => {
        const id = src.topicRef ? `topic:${src.topicRef}` : (src.key ?? "").trim();
        if (!id) {
            problems.push(`Source ${i + 1}: choose a topic or write a source id.`);
            return;
        }
        if (keys.has(id)) problems.push(`Source ${i + 1}: repeated.`);
        keys.add(id);
        const alias = joinSourceAlias(src);
        if (aliases.has(alias)) problems.push(`Source ${i + 1}: the name "${alias}" is repeated.`);
        aliases.add(alias);
    });
    // pipelines takes an empty key path as "topic"
    if (sources.some((src) => src.topicRef) && ((s.keyPath ?? "").trim() || "topic") !== "topic")
        problems.push('Sources given by topic need the key path "topic".');
    if ((s.mode === "all" || s.mode === "set") && sources.length === 0)
        problems.push("This mode needs the list of sources.");
    if ((s.maxAgeSeconds ?? 0) < 0 || (s.timeoutSeconds ?? 0) < 0) problems.push("Times cannot be negative.");
    return problems;
};

// ---- Watchdog ----

export interface WatchdogSettings {
    keyPath?: string;
    timeoutSeconds?: number;
    repeatSeconds?: number;
    sources?: JoinSource[];
    passThrough?: boolean;
}

export const watchdogNumOutputs = (s: WatchdogSettings) => (s.passThrough ? 3 : 2);

export const watchdogProblems = (s: WatchdogSettings): string[] => {
    const problems: string[] = [];
    if ((s.timeoutSeconds ?? 0) < 1) problems.push("The timeout must be at least 1 second.");
    if ((s.repeatSeconds ?? 0) < 0) problems.push("The repeat interval cannot be negative.");
    const sources = s.sources ?? [];
    if (sources.length > 0 && !(s.keyPath ?? "").trim()) problems.push("The expected sources need a key (e.g. topic).");
    problems.push(...joinProblems({ keyPath: s.keyPath || "topic", sources }).filter((p) => !p.includes("mode")));
    return problems;
};

// ---- Alarm ----

export interface AlarmSettings {
    property?: string;
    condition?: "high" | "low" | "equals";
    warning?: string | number;
    alarm?: string | number;
    hysteresis?: number;
    onDelaySeconds?: number;
    offDelaySeconds?: number;
    units?: string;
    description?: string;
    keyPath?: string;
    statusOutput?: boolean;
    updateAssetStatus?: boolean;
    latched?: boolean;
}

export const alarmNumOutputs = (s: AlarmSettings) => (s.statusOutput ? 2 : 1);

const text = (v: unknown) => (v === undefined || v === null ? "" : String(v).trim());

export const alarmProblems = (s: AlarmSettings): string[] => {
    const problems: string[] = [];
    const warning = text(s.warning);
    const alarm = text(s.alarm);
    if (!warning && !alarm) problems.push("Set the Warning level, the Alarm level or both.");
    const condition = s.condition ?? "high";
    if (condition !== "equals") {
        if (warning && !isNumberText(warning)) problems.push(`The Warning level "${warning}" is not a number.`);
        if (alarm && !isNumberText(alarm)) problems.push(`The Alarm level "${alarm}" is not a number.`);
        if (isNumberText(warning) && isNumberText(alarm)) {
            if (condition === "high" && Number(alarm) < Number(warning))
                problems.push("For a high alarm, the Alarm level must be above the Warning level.");
            if (condition === "low" && Number(alarm) > Number(warning))
                problems.push("For a low alarm, the Alarm level must be below the Warning level.");
        }
    }
    if ((s.hysteresis ?? 0) < 0 || (s.onDelaySeconds ?? 0) < 0 || (s.offDelaySeconds ?? 0) < 0)
        problems.push("Hysteresis and delays cannot be negative.");
    return problems;
};

// ---- Machine state ----

export interface MachineRule extends SwitchRule {
    state: string;
    property?: string;
}

export interface MachineStateSettings {
    rules?: MachineRule[];
    defaultState?: string;
    minDurationSeconds?: number;
    unknownAfterSeconds?: number;
    keyPath?: string;
    timezone?: string;
    shifts?: string[];
    summaryEveryMinutes?: number;
    updateAssetState?: boolean;
}

export const machineStateProblems = (s: MachineStateSettings): string[] => {
    const rules = s.rules ?? [];
    const problems = rules.length === 0 ? ["At least one rule is required."] : [];
    rules.forEach((r, i) => {
        if (!(r.state ?? "").trim()) problems.push(`Rule ${i + 1}: the state name is required.`);
    });
    problems.push(...switchProblems({ rules }).filter((p) => !p.startsWith("At least")));
    const shifts = s.shifts ?? [];
    shifts.forEach((sh) => {
        const m = /^(\d{1,2}):(\d{2})$/.exec(sh);
        if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) problems.push(`Shift start "${sh}" is not a time HH:MM.`);
    });
    if (new Set(shifts).size !== shifts.length) problems.push("Shift starts are repeated.");
    if ((s.minDurationSeconds ?? 0) < 0 || (s.unknownAfterSeconds ?? 0) < 0 || (s.summaryEveryMinutes ?? 0) < 0)
        problems.push("Times cannot be negative.");
    return problems;
};

// ---- Rainflow ----

// DNV-RP-C203 categories (pipelines' dsp/rainflow.go has their parameters)
// Table 2-1 (air) of DNV-RP-C203, as in pipelines' dsp/rainflow.go: m1, log a1 (N <= 1e7), log a2 (m2 = 5)
// and the thickness exponent k. In seawater with cathodic protection log a1 is 0.2 lower for m1 = 4 and 0.4
// for m1 = 3 (knee at 1e6 cycles).
const DNV_AIR: Record<string, [number, number, number, number]> = {
    B1: [4, 15.117, 17.146, 0],
    B2: [4, 14.885, 16.856, 0],
    C: [3, 12.592, 16.32, 0.05],
    C1: [3, 12.449, 16.081, 0.1],
    C2: [3, 12.301, 15.835, 0.15],
    D: [3, 12.164, 15.606, 0.2],
    E: [3, 12.01, 15.35, 0.2],
    F: [3, 11.855, 15.091, 0.25],
    F1: [3, 11.699, 14.832, 0.25],
    F3: [3, 11.546, 14.576, 0.25],
    G: [3, 11.398, 14.33, 0.25],
    W1: [3, 11.261, 14.101, 0.25],
    W2: [3, 11.107, 13.845, 0.25],
    W3: [3, 10.97, 13.617, 0.25],
};

export const DNV_CATEGORIES = Object.keys(DNV_AIR);

export interface DnvCurveParams {
    lines: { m: number; logA: number }[];
    k: number;
    kneeCycles: number;
    kneeRange: number; // MPa
}

export const dnvCurve = (category: string, environment: string): DnvCurveParams | undefined => {
    const c = DNV_AIR[category];
    if (!c) return undefined;
    const [m1, airA1, a2, k] = c;
    const seawater = environment === "seawater_cp";
    const a1 = Math.round((airA1 - (seawater ? (m1 === 4 ? 0.2 : 0.4) : 0)) * 1000) / 1000;
    const kneeCycles = seawater ? 1e6 : 1e7;
    return {
        lines: [
            { m: m1, logA: a1 },
            { m: 5, logA: a2 },
        ],
        k,
        kneeCycles,
        kneeRange: Math.pow(10, (a1 - Math.log10(kneeCycles)) / m1),
    };
};

export interface SNLineSetting {
    m?: number | string;
    logA?: number | string;
}

export interface RainflowSettings {
    field?: string;
    scale?: number;
    gate?: number;
    units?: string;
    curveSource?: "dnv" | "custom";
    dnvCategory?: string;
    dnvEnvironment?: "air" | "seawater_cp";
    lines?: SNLineSetting[];
    cutoff?: number;
    scf?: number;
    thickness?: number;
    tRef?: number;
    k?: number | string;
    dff?: number;
    binWidth?: number;
    designLifeYears?: number;
    summaryEveryMinutes?: number;
    timezone?: string;
    keyPath?: string;
    timePath?: string;
}

export const rainflowProblems = (s: RainflowSettings): string[] => {
    const problems: string[] = [];
    if (!(s.field ?? "").trim()) problems.push("The field is required.");
    if (!s.scale) problems.push("The scale cannot be 0.");
    if ((s.binWidth ?? 10) <= 0) problems.push("The bin width must be positive.");
    if ((s.curveSource ?? "dnv") === "custom") {
        const lines = s.lines ?? [];
        if (lines.length === 0) problems.push("The S-N curve needs at least one line (m, log a).");
        lines.forEach((l, i) => {
            if (!(Number(l.m) > 0) || !Number.isFinite(Number(l.logA)) || text(l.logA) === "")
                problems.push(`Line ${i + 1}: m must be positive and log a a number.`);
        });
    } else if (!DNV_CATEGORIES.includes(s.dnvCategory ?? "D")) {
        problems.push("Choose a DNV-RP-C203 category.");
    }
    for (const [name, v] of [
        ["gate", s.gate],
        ["cutoff", s.cutoff],
        ["SCF", s.scf],
        ["thickness", s.thickness],
        ["reference thickness", s.tRef],
        ["DFF", s.dff],
        ["design life", s.designLifeYears],
        ["summary interval", s.summaryEveryMinutes],
    ] as [string, number | undefined][]) {
        if ((v ?? 0) < 0) problems.push(`The ${name} cannot be negative.`);
    }
    return problems;
};

// ---- Vibration ----

export interface VibrationBand {
    name?: string;
    from?: number;
    to?: number;
}

export interface VibrationSettings {
    field?: string;
    mode?: "stream" | "block";
    fs?: number;
    fsPath?: string;
    windowSamples?: number;
    hopSamples?: number;
    segmentLength?: number;
    bands?: VibrationBand[];
    velocity?: boolean;
    velocityFrom?: number;
    velocityTo?: number;
    accelUnit?: "m/s2" | "g";
    minFreq?: number;
    maxFreq?: number;
    includePeaks?: boolean;
    keyPath?: string;
}

export const VIBRATION_MAX_BUFFER = 32768;

export const vibrationProblems = (s: VibrationSettings): string[] => {
    const problems: string[] = [];
    const mode = s.mode ?? "stream";
    if (!((s.fs ?? 0) > 0) && !(mode === "block" && (s.fsPath ?? "").trim()))
        problems.push(mode === "block" ? "Give the sampling rate or the field that carries it." : "The sampling rate is required.");
    if (mode === "stream") {
        const w = s.windowSamples ?? 256;
        if (w < 16 || w > VIBRATION_MAX_BUFFER) problems.push(`The window must have 16 to ${VIBRATION_MAX_BUFFER} samples.`);
        if ((s.hopSamples ?? 0) > w) problems.push("The step cannot be longer than the window.");
    }
    (s.bands ?? []).forEach((b, i) => {
        if (!((b.to ?? 0) > (b.from ?? 0)) || (b.from ?? 0) < 0) problems.push(`Band ${i + 1}: from must be below to.`);
    });
    if (s.velocity && !((s.velocityTo ?? 1000) > (s.velocityFrom ?? 10))) problems.push("The velocity band is empty.");
    return problems;
};

// ---- Totalizer ----

export type TotalizerMode = "counter" | "rate" | "events";

export interface TotalizerItem {
    name: string;
    field?: string;
    mode?: TotalizerMode;
    unit?: string;
    factor?: number;
    rolloverAt?: number;
    maxStep?: number;
    rateTimeUnit?: "s" | "min" | "h" | "d";
    maxGapSeconds?: number;
}

export interface TotalizerSettings {
    items?: TotalizerItem[];
    keyPath?: string;
    timePath?: string;
    timezone?: string;
    summaryEveryMinutes?: number;
}

export const totalizerProblems = (s: TotalizerSettings): string[] => {
    const items = s.items ?? [];
    const problems = items.length === 0 ? ["At least one item is required."] : [];
    const names = new Set<string>();
    items.forEach((it, i) => {
        const where = it.name?.trim() ? `"${it.name.trim()}"` : `Item ${i + 1}`;
        if (!(it.name ?? "").trim()) problems.push(`Item ${i + 1}: the name is required.`);
        else if (names.has(it.name.trim())) problems.push(`${where}: the name is repeated.`);
        names.add((it.name ?? "").trim());
        if ((it.mode ?? "counter") !== "events" && !(it.field ?? "").trim()) problems.push(`${where}: the field is required.`);
        if (it.factor === 0) problems.push(`${where}: the factor cannot be 0.`);
        if ((it.rolloverAt ?? 0) < 0 || (it.maxStep ?? 0) < 0 || (it.maxGapSeconds ?? 0) < 0)
            problems.push(`${where}: rollover, maximum step and maximum gap cannot be negative.`);
    });
    if ((s.summaryEveryMinutes ?? 0) < 0) problems.push("The summary interval cannot be negative.");
    return problems;
};

// ---- OEE ----

export interface OeeSettings {
    stateField?: string;
    stateTimePath?: string;
    productionStates?: string[];
    plannedStopStates?: string[];
    unknownExcluded?: boolean;
    totalField?: string;
    goodField?: string;
    rejectField?: string;
    countMode?: "increment" | "cumulative";
    idealCycleSeconds?: number;
    shifts?: string[];
    breaks?: string[];
    nonWorkingDays?: number[];
    holidays?: string[];
    keyPath?: string;
    timePath?: string;
    timezone?: string;
    summaryEveryMinutes?: number;
}

const clockMinutes = (text: string): number | null => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
    if (!m) return null;
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (h > 24 || min > 59 || (h === 24 && min !== 0)) return null;
    return h * 60 + min;
};

export const oeeProblems = (s: OeeSettings): string[] => {
    const problems: string[] = [];
    const production = s.productionStates ?? [];
    if (production.length === 0) problems.push("At least one production state is required.");
    for (const state of s.plannedStopStates ?? []) {
        if (production.includes(state)) problems.push(`"${state}" cannot be both a production state and a planned stop.`);
    }
    if (!((s.idealCycleSeconds ?? 0) > 0)) problems.push("The ideal cycle time must be greater than 0.");
    const total = (s.totalField ?? "").trim();
    const good = (s.goodField ?? "").trim();
    const reject = (s.rejectField ?? "").trim();
    if (!total && !good) problems.push("The field of the total pieces or of the good pieces is required.");
    else if (!total && !reject) problems.push("With only good pieces, the total or the rejected pieces are needed too.");
    const shifts = s.shifts ?? [];
    shifts.forEach((sh) => {
        const m = clockMinutes(sh);
        if (m === null || m >= 24 * 60) problems.push(`Shift start "${sh}" is not a time HH:MM.`);
    });
    if (new Set(shifts).size !== shifts.length) problems.push("Shift starts are repeated.");
    for (const br of s.breaks ?? []) {
        const [from, to] = br.split("-");
        const a = from === undefined ? null : clockMinutes(from);
        const b = to === undefined ? null : clockMinutes(to);
        if (a === null || b === null || b <= a) problems.push(`Break "${br}" is not a range HH:MM-HH:MM within a day.`);
    }
    for (const day of s.holidays ?? []) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(Date.parse(day))) problems.push(`Holiday "${day}" is not a date YYYY-MM-DD.`);
    }
    if ((s.summaryEveryMinutes ?? 0) < 0) problems.push("The summary interval cannot be negative.");
    return problems;
};

// ---- Degradation ----

export interface DegradationSettings {
    field?: string;
    bucket?: "hour" | "day";
    windowDays?: number;
    model?: "linear" | "exponential";
    threshold?: number | string;
    direction?: "rising" | "falling";
    baseline?: number | string;
    minPoints?: number;
    historyTopicRef?: string;
    historyField?: string;
    keyPath?: string;
    timePath?: string;
    timezone?: string;
}

export const degradationProblems = (s: DegradationSettings): string[] => {
    const problems: string[] = [];
    const threshold = text(s.threshold) === "" ? NaN : Number(s.threshold);
    if (!Number.isFinite(threshold)) problems.push("The failure threshold is required.");
    if (!((s.windowDays ?? 30) > 0)) problems.push("The trend window must be greater than 0 days.");
    const minPoints = s.minPoints ?? 10;
    if (minPoints < 3) problems.push("At least 3 points are needed for a trend.");
    const bucketDays = (s.bucket ?? "hour") === "day" ? 1 : 1 / 24;
    if ((s.windowDays ?? 30) / bucketDays < minPoints) problems.push("The trend window holds fewer buckets than the minimum points.");
    if ((s.model ?? "linear") === "exponential" && Number.isFinite(threshold) && threshold <= 0)
        problems.push("The exponential model needs a threshold greater than 0.");
    if (text(s.baseline) !== "" && Number(s.baseline) === threshold) problems.push("The baseline cannot be the threshold.");
    if (text(s.baseline) !== "" && !Number.isFinite(Number(s.baseline))) problems.push("The baseline must be a number.");
    return problems;
};

// ---- Approval ----

export interface ApprovalSettings {
    channel?: "viewer" | "telegram" | "both";
    title?: string;
    detailField?: string;
    timeoutMinutes?: number;
    chatId?: string;
    timezone?: string;
}

export const APPROVAL_NUM_OUTPUTS = 4;

export const approvalProblems = (s: ApprovalSettings): string[] => {
    const problems: string[] = [];
    const channel = s.channel ?? "viewer";
    if (channel !== "viewer" && !/^-?\d+$/.test((s.chatId ?? "").trim())) problems.push("The Telegram chat id is required (a number).");
    if ((s.timeoutMinutes ?? 60) < 0) problems.push("The timeout cannot be negative.");
    return problems;
};

// ---- Anomaly ----

export interface AnomalySettings {
    field?: string;
    method?: "zscore" | "ewma" | "iqr";
    window?: number;
    threshold?: number;
    lambda?: number;
    warmup?: number;
    adapt?: number;
    learnAnomalies?: boolean;
    resultField?: string;
    anomaliesOutput?: boolean;
    keyPath?: string;
}

export const ANOMALY_MAX_WINDOW = 5000;

export const anomalyNumOutputs = (s: AnomalySettings) => (s.anomaliesOutput ? 2 : 1);

export const anomalyProblems = (s: AnomalySettings): string[] => {
    const problems: string[] = [];
    const method = s.method ?? "zscore";
    if (method !== "ewma") {
        const w = s.window || 100;
        if (w < 4 || w > ANOMALY_MAX_WINDOW) problems.push(`The window must have 4 to ${ANOMALY_MAX_WINDOW} samples.`);
        if ((s.warmup || 0) > w) problems.push("The warm-up cannot be longer than the window.");
    } else if (s.lambda !== undefined && s.lambda !== 0 && !(s.lambda > 0 && s.lambda <= 1)) {
        problems.push("Lambda must be in (0, 1].");
    }
    if (s.warmup !== undefined && s.warmup !== 0 && s.warmup < 2) problems.push("The warm-up needs at least 2 samples.");
    if ((s.threshold ?? 0) < 0) problems.push("The threshold must be positive.");
    if ((s.adapt ?? 0) < 0 || (s.adapt ?? 0) >= 1) problems.push("The adaptation must be in [0, 1).");
    if (!(s.resultField ?? "anomaly").trim()) problems.push("The result field is required.");
    return problems;
};

// ---- Pose estimation ----

export interface PoseEstimationSettings {
    mode?: "camera" | "object";
    inputPath?: string;
    keypointNames?: string[];
    // JSON: {class: [names in the model's order]}, for objects detected as several classes
    keypointNamesByClass?: string | Record<string, unknown>;
    className?: string;
    minConfidence?: number;
    // JSON texts (or values): {name: [x, y, z]}, OpenCV's calibration, the moving parts
    points?: string | Record<string, unknown> | unknown[];
    pointsFrame?: "gltf" | "blender";
    pointsScale?: number;
    calibration?: string | Record<string, unknown>;
    fovDeg?: number;
    // side the field of view is measured on: vertical, horizontal or long (the longer side, the same in portrait and landscape)
    fovSide?: "vertical" | "horizontal" | "long";
    imageWidthPath?: string;
    imageHeightPath?: string;
    parts?: string | unknown[];
    inlierThreshold?: number;
    minPoints?: number;
    smoothing?: boolean;
    positionNoise?: number;
    // added to positionNoise as a fraction of the camera distance (a far camera is less sure of its depth)
    positionNoiseRelative?: number;
    angleNoiseDeg?: number;
    maxAcceleration?: number;
    maxAngularAccelerationDeg?: number;
    resetAfter?: number;
    // a pose further than this from the previous one (degrees, fraction of the distance) is left out until
    // confirmFrames frames agree; maxJumpDeg 0: no check
    maxJumpDeg?: number;
    maxJump?: number;
    confirmFrames?: number;
    viewerOutput?: boolean;
    follow?: boolean;
    objectNodeName?: string;
    resultField?: string;
    keyPath?: string;
    timePath?: string;
}

// A JSON setting: its value, or why it is not valid ("" when empty)
export const parseJsonSetting = (v: unknown): { value?: unknown; error?: string } => {
    if (v === undefined || v === null) return {};
    if (typeof v !== "string") return { value: v };
    if (!v.trim()) return {};
    try {
        return { value: JSON.parse(v) };
    } catch (e) {
        return { error: (e as Error).message };
    }
};

export const POSE_PARTS_EXAMPLE = `[
  {
    "name": "rotor",
    "type": "rotation",
    "keypoints": ["Blade_1", "Blade_2", "Blade_3"],
    "axisOrigin": "Hub",
    "axisDirection": [0, 1, 0],
    "symmetry": 3,
    "direction": "positive",
    "expectedSpeed": 6.283,
    "nodeName": "Rotor"
  }
]`;

export const poseEstimationProblems = (s: PoseEstimationSettings): string[] => {
    const problems: string[] = [];
    const points = parseJsonSetting(s.points);
    let names: string[] = [];
    if (points.error) problems.push(`The 3D points are not valid JSON: ${points.error}`);
    else if (points.value === undefined) problems.push("The 3D points of the object are required.");
    else if (Array.isArray(points.value)) names = points.value.map((p) => String((p as { name?: unknown })?.name ?? ""));
    else if (typeof points.value === "object") names = Object.keys(points.value as object);
    else problems.push("The 3D points must be an object {name: [x, y, z]} or a list of {name, x, y, z}.");
    const parts = parseJsonSetting(s.parts);
    const moving = new Set<string>();
    if (parts.error) problems.push(`The moving parts are not valid JSON: ${parts.error}`);
    else if (parts.value !== undefined && !Array.isArray(parts.value)) problems.push("The moving parts must be a list.");
    else if (Array.isArray(parts.value)) {
        parts.value.forEach((p, i) => {
            const part = p as { name?: unknown; keypoints?: unknown; axisDirection?: unknown; type?: unknown; restAngles?: unknown; zeroDirection?: unknown };
            if (!part || typeof part !== "object") return problems.push(`Part ${i + 1} is not an object.`);
            if (typeof part.name !== "string" || !part.name) problems.push(`Part ${i + 1} needs a name.`);
            if (!Array.isArray(part.keypoints) || part.keypoints.length === 0) problems.push(`Part ${i + 1} needs keypoints.`);
            else part.keypoints.forEach((k) => moving.add(String(k)));
            if (!Array.isArray(part.axisDirection)) problems.push(`Part ${i + 1} needs an axisDirection [x, y, z].`);
            if (part.type !== undefined && part.type !== "rotation" && part.type !== "translation")
                problems.push(`Part ${i + 1}: type must be rotation or translation.`);
            if (part.restAngles !== undefined && !Array.isArray(part.zeroDirection))
                problems.push(`Part ${i + 1}: restAngles need zeroDirection (where 0° is).`);
            return undefined;
        });
    }
    const rigid = names.filter((n) => !moving.has(n)).length;
    if (points.value !== undefined && !points.error && rigid < 4) problems.push("The rigid body needs at least 4 points (not in a moving part).");
    const byClass = parseJsonSetting(s.keypointNamesByClass);
    if (byClass.error) problems.push(`The keypoint names by class are not valid JSON: ${byClass.error}`);
    else if (byClass.value !== undefined && (typeof byClass.value !== "object" || Array.isArray(byClass.value)))
        problems.push("The keypoint names by class must be an object {class: [names in the model's order]}.");
    const calibration = parseJsonSetting(s.calibration);
    if (calibration.error) problems.push(`The calibration is not valid JSON: ${calibration.error}`);
    else if (calibration.value !== undefined && (typeof calibration.value !== "object" || Array.isArray(calibration.value)))
        problems.push("The calibration must be a JSON object (camera_matrix, dist_coeffs...).");
    const fov = s.fovDeg ?? 60;
    if (!(fov > 1 && fov < 170)) problems.push("The field of view must be between 1° and 170°.");
    if (s.fovSide !== undefined && !["vertical", "horizontal", "long"].includes(s.fovSide))
        problems.push("The field of view side must be vertical, horizontal or long.");
    const conf = s.minConfidence ?? 0.5;
    if (conf < 0 || conf > 1) problems.push("The minimum confidence must be between 0 and 1.");
    if ((s.inlierThreshold ?? 8) <= 0) problems.push("The inlier threshold must be positive.");
    if ((s.maxJumpDeg ?? 30) < 0 || (s.maxJump ?? 0.3) < 0) problems.push("The jump limits cannot be negative.");
    if ((s.positionNoiseRelative ?? 0.05) < 0) problems.push("The relative position noise cannot be negative.");
    if (rigid > 0 && (s.minPoints ?? 6) > rigid) problems.push("Minimum points is more than the rigid body has.");
    if (!(s.resultField ?? "pose").trim()) problems.push("The result field is required.");
    return problems;
};

// ---- defaults (palette) ----

export const SIGNAL_DEFAULT_SETTINGS: Record<SignalNodeType, Record<string, unknown>> = {
    Watchdog: {
        keyPath: "topic",
        timeoutSeconds: 60,
        repeatSeconds: 0,
        sources: [],
        passThrough: false,
    },
    Alarm: {
        property: "payload.value",
        condition: "high",
        warning: "",
        alarm: "",
        hysteresis: 0,
        onDelaySeconds: 0,
        offDelaySeconds: 0,
        units: "",
        description: "",
        keyPath: "",
        statusOutput: false,
        updateAssetStatus: false,
        latched: false,
    },
    Rainflow: {
        field: "payload.value",
        scale: 1,
        gate: 0,
        units: "MPa",
        curveSource: "dnv",
        dnvCategory: "D",
        dnvEnvironment: "air",
        lines: [
            { m: 3, logA: 12.164 },
            { m: 5, logA: 15.606 },
        ],
        cutoff: 0,
        scf: 1,
        thickness: 0,
        tRef: 25,
        k: "",
        dff: 1,
        binWidth: 10,
        designLifeYears: 0,
        summaryEveryMinutes: 0,
        timezone: "",
        keyPath: "",
        timePath: "payload.timestamp",
    },
    Vibration: {
        field: "payload.value",
        mode: "stream",
        fs: 1,
        fsPath: "",
        windowSamples: 256,
        hopSamples: 0,
        segmentLength: 0,
        bands: [],
        velocity: false,
        velocityFrom: 10,
        velocityTo: 1000,
        accelUnit: "m/s2",
        minFreq: 0,
        maxFreq: 0,
        includePeaks: false,
        keyPath: "",
    },
    Totalizer: {
        items: [{ name: "energy", field: "payload.value", mode: "counter", unit: "kWh", factor: 1, rolloverAt: 0, maxStep: 0 }],
        keyPath: "",
        timePath: "payload.timestamp",
        timezone: "",
        summaryEveryMinutes: 0,
    },
    OEE: {
        stateField: "payload.state",
        stateTimePath: "payload.since",
        productionStates: ["Running"],
        plannedStopStates: [],
        unknownExcluded: false,
        totalField: "payload.pieces",
        goodField: "",
        rejectField: "",
        countMode: "increment",
        idealCycleSeconds: 60,
        shifts: [],
        breaks: [],
        nonWorkingDays: [],
        holidays: [],
        keyPath: "",
        timePath: "payload.timestamp",
        timezone: "",
        summaryEveryMinutes: 0,
    },
    Degradation: {
        field: "payload.value",
        bucket: "hour",
        windowDays: 30,
        model: "linear",
        threshold: "",
        direction: "rising",
        baseline: "",
        minPoints: 10,
        historyTopicRef: "",
        historyField: "",
        keyPath: "",
        timePath: "payload.timestamp",
        timezone: "",
    },
    Approval: {
        channel: "viewer",
        title: "Approval request",
        detailField: "",
        timeoutMinutes: 60,
        chatId: "",
        timezone: "",
    },
    PoseEstimation: {
        mode: "camera",
        inputPath: "payload.detections",
        keypointNames: [],
        keypointNamesByClass: "",
        className: "",
        minConfidence: 0.5,
        points: "",
        pointsFrame: "gltf",
        pointsScale: 1,
        calibration: "",
        fovDeg: 60,
        fovSide: "vertical",
        imageWidthPath: "payload.width",
        imageHeightPath: "payload.height",
        parts: "",
        inlierThreshold: 8,
        minPoints: 6,
        smoothing: true,
        positionNoise: 0.01,
        positionNoiseRelative: 0.05,
        angleNoiseDeg: 1,
        maxAcceleration: 2,
        maxAngularAccelerationDeg: 180,
        resetAfter: 2,
        maxJumpDeg: 30,
        maxJump: 0.3,
        confirmFrames: 3,
        viewerOutput: true,
        follow: true,
        objectNodeName: "",
        resultField: "pose",
        keyPath: "",
        timePath: "payload.timestamp",
    },
    Anomaly: {
        field: "payload.value",
        method: "zscore",
        window: 100,
        threshold: 3,
        lambda: 0.2,
        warmup: 30,
        adapt: 0,
        learnAnomalies: false,
        resultField: "anomaly",
        anomaliesOutput: false,
        keyPath: "",
    },
    MachineState: {
        rules: [{ state: "Running", property: "payload.value", operator: "gt", value: "0" }],
        defaultState: "Stopped",
        minDurationSeconds: 0,
        unknownAfterSeconds: 0,
        keyPath: "",
        timezone: "",
        shifts: [],
        summaryEveryMinutes: 0,
        updateAssetState: false,
    },
    Switch: {
        property: "payload.value",
        checkMode: "first",
        otherwise: true,
        rules: [{ operator: "gt", value: "0", value2: "" }],
    },
    Deadband: {
        fields: ["payload.value"],
        bandType: "absolute",
        band: 0,
        maxIntervalSeconds: 0,
        keyPath: "topic",
        timePath: "",
        blockedOutput: false,
    },
    Window: {
        fields: ["payload.value"],
        windowType: "count",
        size: 10,
        durationSeconds: 60,
        mode: "tumbling",
        stats: ["count", "mean", "min", "max"],
        keyPath: "topic",
        timePath: "",
    },
    Join: {
        keyPath: "topic",
        valuePath: "payload",
        sources: [],
        mode: "latest",
        maxAgeSeconds: 0,
        timeoutSeconds: 0,
        output: "nested",
        timePath: "",
    },
};

export const signalProblems = (type: SignalNodeType, settings: Record<string, any>): string[] => {
    switch (type) {
        case "Switch":
            return switchProblems(settings);
        case "Deadband":
            return deadbandProblems(settings);
        case "Window":
            return windowProblems(settings);
        case "Join":
            return joinProblems(settings);
        case "Watchdog":
            return watchdogProblems(settings);
        case "Alarm":
            return alarmProblems(settings);
        case "MachineState":
            return machineStateProblems(settings);
        case "Rainflow":
            return rainflowProblems(settings);
        case "Vibration":
            return vibrationProblems(settings);
        case "Anomaly":
            return anomalyProblems(settings);
        case "PoseEstimation":
            return poseEstimationProblems(settings);
        case "Totalizer":
            return totalizerProblems(settings);
        case "OEE":
            return oeeProblems(settings);
        case "Degradation":
            return degradationProblems(settings);
        case "Approval":
            return approvalProblems(settings);
    }
};

// Text lists edited as "a, b, c"
export const parseList = (text: string) =>
    text
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s !== "");
