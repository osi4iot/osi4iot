// The options pane of the panel editor: for each visualization, its sections and options with Grafana's
// names, in Grafana's order. Each option edits a path of the panel's settings ("options.legend.placement",
// "fieldConfig.defaults.custom.lineWidth") or of the panel itself ("panel.title").
import { REDUCERS, VizType } from "./chartConfig";

export type OptionKind =
    | "text"
    | "textarea"
    | "number"
    | "radio"
    | "select"
    | "switch"
    | "slider"
    | "unit"
    | "color"
    | "thresholds"
    | "mappings"
    | "calcs"
    | "calc"
    | "links"
    | "multi";

export interface OptionItem {
    kind: OptionKind;
    label: string;
    path: string;
    description?: string;
    choices?: { value: string | number | boolean; label: string }[];
    min?: number;
    max?: number;
    step?: number;
    placeholder?: string;
    // shown only when this returns true (e.g. the point size when points are shown)
    when?: (get: (path: string) => unknown) => boolean;
}

export interface OptionSection {
    id: string;
    title: string;
    items: OptionItem[];
}

const c = (value: string | number | boolean, label: string) => ({ value, label });

const panelSection: OptionSection = {
    id: "panel",
    title: "Panel options",
    items: [
        { kind: "text", label: "Title", path: "panel.title", placeholder: "Chart" },
        { kind: "textarea", label: "Description", path: "options.description", description: "Shown as a tooltip of the title" },
        { kind: "switch", label: "Transparent background", path: "options.transparent" },
        { kind: "links", label: "Panel links", path: "options.links", description: "Links in the bar of the panel" },
    ],
};

const dataLinksSection: OptionSection = {
    id: "links",
    title: "Data links",
    items: [
        {
            kind: "links",
            label: "Data links",
            path: "fieldConfig.defaults.links",
            description: "Open when a value is clicked. Variables: ${__value.raw}, ${__value.time}, ${__series.name}, ${__from}, ${__to}, ${__url_time_range}",
        },
    ],
};

const tooltipSection: OptionSection = {
    id: "tooltip",
    title: "Tooltip",
    items: [
        { kind: "radio", label: "Tooltip mode", path: "options.tooltip.mode", choices: [c("single", "Single"), c("multi", "All"), c("none", "Hidden")] },
        { kind: "radio", label: "Values sort order", path: "options.tooltip.sort", choices: [c("none", "None"), c("asc", "Ascending"), c("desc", "Descending")], when: (g) => g("options.tooltip.mode") === "multi" },
    ],
};

const legendSection: OptionSection = {
    id: "legend",
    title: "Legend",
    items: [
        { kind: "switch", label: "Visibility", path: "options.legend.showLegend" },
        { kind: "radio", label: "Mode", path: "options.legend.displayMode", choices: [c("list", "List"), c("table", "Table")], when: (g) => g("options.legend.showLegend") !== false },
        { kind: "radio", label: "Placement", path: "options.legend.placement", choices: [c("bottom", "Bottom"), c("right", "Right")], when: (g) => g("options.legend.showLegend") !== false },
        { kind: "calcs", label: "Values", path: "options.legend.calcs", description: "Calculations shown next to each series", when: (g) => g("options.legend.showLegend") !== false },
    ],
};

const axisSection: OptionSection = {
    id: "axis",
    title: "Axis",
    items: [
        { kind: "radio", label: "Placement", path: "fieldConfig.defaults.custom.axisPlacement", choices: [c("auto", "Auto"), c("left", "Left"), c("right", "Right"), c("hidden", "Hidden")] },
        { kind: "text", label: "Label", path: "fieldConfig.defaults.custom.axisLabel", placeholder: "Optional text" },
        { kind: "number", label: "Soft min", path: "fieldConfig.defaults.custom.axisSoftMin", placeholder: "auto", description: "The axis starts here unless the data goes lower" },
        { kind: "number", label: "Soft max", path: "fieldConfig.defaults.custom.axisSoftMax", placeholder: "auto" },
        { kind: "radio", label: "Scale", path: "fieldConfig.defaults.custom.scaleDistribution.type", choices: [c("linear", "Linear"), c("log", "Logarithmic")] },
    ],
};

const standardSection: OptionSection = {
    id: "standard",
    title: "Standard options",
    items: [
        { kind: "unit", label: "Unit", path: "fieldConfig.defaults.unit" },
        { kind: "number", label: "Min", path: "fieldConfig.defaults.min", placeholder: "auto", description: "Leave empty to calculate it from the data" },
        { kind: "number", label: "Max", path: "fieldConfig.defaults.max", placeholder: "auto" },
        { kind: "number", label: "Decimals", path: "fieldConfig.defaults.decimals", placeholder: "auto", min: 0, max: 10 },
        {
            kind: "select",
            label: "Color scheme",
            path: "fieldConfig.defaults.color.mode",
            choices: [c("palette-classic", "Classic palette"), c("fixed", "Single color"), c("thresholds", "From thresholds (by value)")],
        },
        { kind: "color", label: "Color", path: "fieldConfig.defaults.color.fixedColor", when: (g) => g("fieldConfig.defaults.color.mode") === "fixed" },
        { kind: "text", label: "No value", path: "fieldConfig.defaults.noValue", placeholder: "No data", description: "What is shown when there is no value" },
    ],
};

const thresholdsSection = (withStyle: boolean): OptionSection => ({
    id: "thresholds",
    title: "Thresholds",
    items: [
        { kind: "thresholds", label: "Thresholds", path: "fieldConfig.defaults.thresholds" },
        ...(withStyle
            ? [
                  {
                      kind: "select" as const,
                      label: "Show thresholds",
                      path: "fieldConfig.defaults.custom.thresholdsStyle.mode",
                      choices: [c("off", "Off"), c("line", "As lines"), c("dashed", "As lines (dashed)"), c("area", "As filled regions"), c("line+area", "As filled regions and lines")],
                  },
              ]
            : []),
    ],
});

const mappingsSection: OptionSection = {
    id: "mappings",
    title: "Value mappings",
    items: [{ kind: "mappings", label: "Value mappings", path: "fieldConfig.defaults.mappings", description: "Show a text and colour instead of a value, or of a range of values" }],
};

const valueSection: OptionSection = {
    id: "value",
    title: "Value options",
    items: [{ kind: "calc", label: "Calculation", path: "options.reduceOptions.calcs", description: "How each series becomes one value" }],
};

const graphStyles: OptionSection = {
    id: "graph",
    title: "Graph styles",
    items: [
        { kind: "radio", label: "Style", path: "fieldConfig.defaults.custom.drawStyle", choices: [c("line", "Lines"), c("bars", "Bars"), c("points", "Points")] },
        {
            kind: "radio",
            label: "Line interpolation",
            path: "fieldConfig.defaults.custom.lineInterpolation",
            choices: [c("linear", "Linear"), c("smooth", "Smooth"), c("stepBefore", "Step before"), c("stepAfter", "Step after")],
            when: (g) => g("fieldConfig.defaults.custom.drawStyle") === "line",
        },
        { kind: "slider", label: "Line width", path: "fieldConfig.defaults.custom.lineWidth", min: 0, max: 10, step: 1, when: (g) => g("fieldConfig.defaults.custom.drawStyle") !== "points" },
        { kind: "slider", label: "Fill opacity", path: "fieldConfig.defaults.custom.fillOpacity", min: 0, max: 100, step: 1, when: (g) => g("fieldConfig.defaults.custom.drawStyle") !== "points" },
        { kind: "radio", label: "Gradient mode", path: "fieldConfig.defaults.custom.gradientMode", choices: [c("none", "None"), c("opacity", "Opacity"), c("hue", "Hue")], when: (g) => g("fieldConfig.defaults.custom.drawStyle") === "line" },
        { kind: "radio", label: "Line style", path: "fieldConfig.defaults.custom.lineStyle.fill", choices: [c("solid", "Solid"), c("dash", "Dash"), c("dot", "Dots")], when: (g) => g("fieldConfig.defaults.custom.drawStyle") === "line" },
        { kind: "radio", label: "Connect null values", path: "fieldConfig.defaults.custom.spanNulls", choices: [c(false, "Never"), c(true, "Always")], when: (g) => g("fieldConfig.defaults.custom.drawStyle") === "line" },
        { kind: "radio", label: "Show points", path: "fieldConfig.defaults.custom.showPoints", choices: [c("auto", "Auto"), c("always", "Always"), c("never", "Never")], when: (g) => g("fieldConfig.defaults.custom.drawStyle") === "line" },
        { kind: "slider", label: "Point size", path: "fieldConfig.defaults.custom.pointSize", min: 1, max: 40, step: 1, when: (g) => g("fieldConfig.defaults.custom.drawStyle") === "points" || g("fieldConfig.defaults.custom.showPoints") === "always" },
        { kind: "radio", label: "Stack series", path: "fieldConfig.defaults.custom.stacking.mode", choices: [c("none", "Off"), c("normal", "Normal"), c("percent", "100%")] },
    ],
};

export const OPTION_SECTIONS: Record<VizType, OptionSection[]> = {
    timeseries: [panelSection, tooltipSection, legendSection, axisSection, graphStyles, standardSection, thresholdsSection(true), mappingsSection],
    barchart: [
        panelSection,
        {
            id: "bar",
            title: "Bar chart",
            items: [
                { kind: "radio", label: "Orientation", path: "options.orientation", choices: [c("auto", "Auto"), c("horizontal", "Horizontal"), c("vertical", "Vertical")] },
                { kind: "slider", label: "Rotate x-axis tick labels", path: "options.xTickLabelRotation", min: -90, max: 90, step: 15 },
                { kind: "radio", label: "Show values", path: "options.showValue", choices: [c("auto", "Auto"), c("always", "Always"), c("never", "Never")] },
                { kind: "radio", label: "Stacking", path: "options.stacking", choices: [c("none", "Off"), c("normal", "Normal"), c("percent", "100%")] },
                { kind: "slider", label: "Group width", path: "options.groupWidth", min: 0, max: 1, step: 0.05 },
                { kind: "slider", label: "Bar width", path: "options.barWidth", min: 0, max: 1, step: 0.05 },
                { kind: "slider", label: "Line width", path: "fieldConfig.defaults.custom.lineWidth", min: 0, max: 10, step: 1 },
                { kind: "slider", label: "Fill opacity", path: "fieldConfig.defaults.custom.fillOpacity", min: 0, max: 100, step: 1 },
            ],
        },
        tooltipSection,
        legendSection,
        axisSection,
        standardSection,
        thresholdsSection(true),
        mappingsSection,
    ],
    stat: [
        panelSection,
        valueSection,
        {
            id: "stat",
            title: "Stat styles",
            items: [
                { kind: "radio", label: "Orientation", path: "options.orientation", choices: [c("auto", "Auto"), c("horizontal", "Horizontal"), c("vertical", "Vertical")] },
                { kind: "select", label: "Text mode", path: "options.textMode", choices: [c("auto", "Auto"), c("value", "Value"), c("value_and_name", "Value and name"), c("name", "Name"), c("none", "None")] },
                { kind: "select", label: "Color mode", path: "options.colorMode", choices: [c("none", "None"), c("value", "Value"), c("background", "Background gradient"), c("background_solid", "Background solid")] },
                { kind: "radio", label: "Graph mode", path: "options.graphMode", choices: [c("none", "None"), c("area", "Area")] },
                { kind: "radio", label: "Text alignment", path: "options.justifyMode", choices: [c("auto", "Auto"), c("center", "Center")] },
                { kind: "switch", label: "Show percent change", path: "options.showPercentChange" },
            ],
        },
        standardSection,
        thresholdsSection(false),
        mappingsSection,
    ],
    gauge: [
        panelSection,
        valueSection,
        {
            id: "gauge",
            title: "Gauge",
            items: [
                { kind: "radio", label: "Orientation", path: "options.orientation", choices: [c("auto", "Auto"), c("horizontal", "Horizontal"), c("vertical", "Vertical")] },
                { kind: "switch", label: "Show threshold labels", path: "options.showThresholdLabels" },
                { kind: "switch", label: "Show threshold markers", path: "options.showThresholdMarkers" },
            ],
        },
        standardSection,
        thresholdsSection(false),
        mappingsSection,
    ],
    bargauge: [
        panelSection,
        valueSection,
        {
            id: "bargauge",
            title: "Bar gauge",
            items: [
                { kind: "radio", label: "Orientation", path: "options.orientation", choices: [c("horizontal", "Horizontal"), c("vertical", "Vertical")] },
                { kind: "radio", label: "Display mode", path: "options.displayMode", choices: [c("gradient", "Gradient"), c("lcd", "Retro LCD"), c("basic", "Basic")] },
                { kind: "radio", label: "Value display", path: "options.valueMode", choices: [c("color", "Value color"), c("text", "Text color"), c("hidden", "Hidden")] },
                { kind: "radio", label: "Name placement", path: "options.namePlacement", choices: [c("auto", "Auto"), c("top", "Top"), c("left", "Left"), c("hidden", "Hidden")] },
                { kind: "switch", label: "Show unfilled area", path: "options.showUnfilled" },
                { kind: "number", label: "Min height", path: "options.minVizHeight", min: 4, max: 200 },
            ],
        },
        standardSection,
        thresholdsSection(false),
        mappingsSection,
    ],
    table: [
        panelSection,
        {
            id: "table",
            title: "Table",
            items: [
                { kind: "radio", label: "Rows", path: "options.rowMode", choices: [c("time", "One per interval"), c("series", "One per series")] },
                { kind: "calcs", label: "Calculations", path: "options.rowCalcs", description: "The columns of each series", when: (g) => g("options.rowMode") === "series" },
                { kind: "switch", label: "Show table header", path: "options.showHeader" },
                { kind: "radio", label: "Cell height", path: "options.cellHeight", choices: [c("sm", "Small"), c("md", "Medium"), c("lg", "Large")] },
                { kind: "number", label: "Minimum column width", path: "fieldConfig.defaults.custom.minWidth", min: 0, max: 600, placeholder: "auto" },
                { kind: "radio", label: "Column alignment", path: "fieldConfig.defaults.custom.align", choices: [c("auto", "Auto"), c("left", "Left"), c("center", "Center"), c("right", "Right")] },
            ],
        },
        {
            id: "cell",
            title: "Cell options",
            items: [
                {
                    kind: "select",
                    label: "Cell type",
                    path: "fieldConfig.defaults.custom.cellOptions.type",
                    choices: [c("auto", "Auto"), c("color-text", "Colored text"), c("color-background", "Colored background"), c("gauge", "Gauge")],
                },
            ],
        },
        {
            id: "footer",
            title: "Table footer",
            items: [
                { kind: "switch", label: "Show table footer", path: "options.footer.show", when: (g) => g("options.rowMode") !== "series" },
                { kind: "calc", label: "Calculation", path: "options.footer.reducer", when: (g) => g("options.footer.show") === true },
            ],
        },
        standardSection,
        thresholdsSection(false),
        mappingsSection,
    ],
    piechart: [
        panelSection,
        valueSection,
        {
            id: "pie",
            title: "Pie chart",
            items: [
                { kind: "radio", label: "Pie chart type", path: "options.pieType", choices: [c("pie", "Pie"), c("donut", "Donut")] },
                { kind: "multi", label: "Labels", path: "options.displayLabels", choices: [c("name", "Name"), c("value", "Value"), c("percent", "Percent")] },
            ],
        },
        tooltipSection,
        {
            id: "legend",
            title: "Legend",
            items: [
                { kind: "switch", label: "Visibility", path: "options.legend.showLegend" },
                { kind: "radio", label: "Mode", path: "options.legend.displayMode", choices: [c("list", "List"), c("table", "Table")], when: (g) => g("options.legend.showLegend") !== false },
                { kind: "radio", label: "Placement", path: "options.legend.placement", choices: [c("bottom", "Bottom"), c("right", "Right")], when: (g) => g("options.legend.showLegend") !== false },
                { kind: "multi", label: "Legend values", path: "options.legend.values", choices: [c("percent", "Percent"), c("value", "Value")], when: (g) => g("options.legend.showLegend") !== false },
            ],
        },
        standardSection,
        mappingsSection,
    ],
    statetimeline: [
        panelSection,
        {
            id: "state",
            title: "State timeline",
            items: [
                { kind: "switch", label: "Merge equal consecutive values", path: "options.mergeValues" },
                { kind: "radio", label: "Show values", path: "options.showValue", choices: [c("auto", "Auto"), c("always", "Always"), c("never", "Never")] },
                { kind: "radio", label: "Align values", path: "options.alignValue", choices: [c("left", "Left"), c("center", "Center"), c("right", "Right")] },
                { kind: "slider", label: "Row height", path: "options.rowHeight", min: 0.2, max: 1, step: 0.05 },
                { kind: "slider", label: "Fill opacity", path: "fieldConfig.defaults.custom.fillOpacity", min: 0, max: 100, step: 1 },
            ],
        },
        {
            id: "legend",
            title: "Legend",
            items: [{ kind: "switch", label: "Visibility", path: "options.legend.showLegend", description: "The states and their colours" }],
        },
        standardSection,
        { ...mappingsSection, items: [{ ...mappingsSection.items[0], description: "The names and colours of the states (e.g. 0 → Off, 1 → On)" }] },
        thresholdsSection(false),
    ],
    histogram: [
        panelSection,
        {
            id: "histogram",
            title: "Histogram",
            items: [
                { kind: "number", label: "Bucket count", path: "options.bucketCount", min: 1, max: 500, description: "About how many bins (the width is rounded)" },
                { kind: "number", label: "Bucket size", path: "options.bucketSize", placeholder: "auto", description: "The width of each bin (over the bucket count)" },
                { kind: "number", label: "Bucket offset", path: "options.bucketOffset", placeholder: "0", description: "Where the bins start" },
                { kind: "switch", label: "Combine series", path: "options.combine" },
                { kind: "slider", label: "Line width", path: "fieldConfig.defaults.custom.lineWidth", min: 0, max: 10, step: 1 },
                { kind: "slider", label: "Fill opacity", path: "fieldConfig.defaults.custom.fillOpacity", min: 0, max: 100, step: 1 },
            ],
        },
        legendSection,
        standardSection,
    ],
};

// every visualization ends with its data links (Grafana's order)
for (const key of Object.keys(OPTION_SECTIONS) as VizType[]) OPTION_SECTIONS[key] = [...OPTION_SECTIONS[key], dataLinksSection];

export const CALC_CHOICES = REDUCERS.map((r) => ({ value: r.id, label: r.name }));

// The options whose label or description has the words searched (all of them, with no words)
export const searchSections = (sections: OptionSection[], query: string): OptionSection[] => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return sections;
    return sections
        .map((s) => ({
            ...s,
            items: s.items.filter((i) => {
                const text = `${s.title} ${i.label} ${i.description ?? ""}`.toLowerCase();
                return words.every((w) => text.includes(w));
            }),
        }))
        .filter((s) => s.items.length > 0);
};
