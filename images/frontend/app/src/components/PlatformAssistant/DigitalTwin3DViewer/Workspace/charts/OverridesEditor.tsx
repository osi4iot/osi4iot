// The "Overrides" tab of the panel editor, as Grafana's: settings for some series only (by their name, or by a
// regular expression of it): their name, colour, unit, decimals, min / max, thresholds, value mappings, links,
// and the graph styles of a time series (style, line width, fill, interpolation, points, axis, hide).
import { FC, useState } from "react";
import styled from "styled-components";
import { Plus, Trash2 } from "lucide-react";
import { FieldOverride, OverrideProperty, VizType } from "./chartConfig";
import { OptionItem } from "./optionsSchema";
import { ColorSelect, Input, OptionControl, Select } from "./OptionControls";

const font = `Roboto, "Helvetica Neue", Arial, sans-serif`;

const Card = styled.div`
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 12px;
    margin-bottom: 10px;
    border: 1px solid #2c3137;
    border-radius: 10px;
    background: #15171a;
`;

const Head = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: #9aa1aa;

    strong {
        color: #e6e8eb;
        font-weight: 600;
    }
`;

const Small = styled.button`
    height: 30px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0 10px;
    background: transparent;
    border: 1px dashed #3a4048;
    border-radius: 7px;
    color: #c7cbd1;
    font: 500 12px ${font};
    cursor: pointer;
    align-self: flex-start;

    svg {
        width: 14px;
        height: 14px;
    }
`;

const Icon = styled.button`
    width: 30px;
    height: 30px;
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 6px;
    color: #9aa1aa;
    cursor: pointer;

    &:hover {
        border-color: #3a4048;
        color: #e6e8eb;
    }

    svg {
        width: 14px;
        height: 14px;
    }
`;

const c = (value: string | number | boolean, label: string) => ({ value, label });

interface PropertyInfo {
    id: string;
    name: string;
    item: Omit<OptionItem, "path" | "label">;
    // only for some visualizations
    viz?: VizType[];
}

const LINE_VIZ: VizType[] = ["timeseries"];

export const OVERRIDE_PROPERTIES: PropertyInfo[] = [
    { id: "displayName", name: "Display name", item: { kind: "text" } },
    { id: "color", name: "Color scheme › Single color", item: { kind: "color" } },
    { id: "unit", name: "Unit", item: { kind: "unit" } },
    { id: "decimals", name: "Decimals", item: { kind: "number", min: 0, max: 10 } },
    { id: "min", name: "Min", item: { kind: "number" } },
    { id: "max", name: "Max", item: { kind: "number" } },
    { id: "thresholds", name: "Thresholds", item: { kind: "thresholds" } },
    { id: "mappings", name: "Value mappings", item: { kind: "mappings" } },
    { id: "links", name: "Data links", item: { kind: "links" } },
    { id: "noValue", name: "No value", item: { kind: "text" } },
    { id: "custom.drawStyle", name: "Graph styles › Style", item: { kind: "radio", choices: [c("line", "Lines"), c("bars", "Bars"), c("points", "Points")] }, viz: LINE_VIZ },
    {
        id: "custom.lineInterpolation",
        name: "Graph styles › Line interpolation",
        item: { kind: "radio", choices: [c("linear", "Linear"), c("smooth", "Smooth"), c("stepBefore", "Step before"), c("stepAfter", "Step after")] },
        viz: LINE_VIZ,
    },
    { id: "custom.lineWidth", name: "Graph styles › Line width", item: { kind: "slider", min: 0, max: 10, step: 1 }, viz: LINE_VIZ },
    { id: "custom.fillOpacity", name: "Graph styles › Fill opacity", item: { kind: "slider", min: 0, max: 100, step: 1 }, viz: LINE_VIZ },
    { id: "custom.lineStyle.fill", name: "Graph styles › Line style", item: { kind: "radio", choices: [c("solid", "Solid"), c("dash", "Dash"), c("dot", "Dots")] }, viz: LINE_VIZ },
    { id: "custom.showPoints", name: "Graph styles › Show points", item: { kind: "radio", choices: [c("auto", "Auto"), c("always", "Always"), c("never", "Never")] }, viz: LINE_VIZ },
    { id: "custom.axisPlacement", name: "Axis › Placement", item: { kind: "radio", choices: [c("left", "Left"), c("right", "Right")] }, viz: ["timeseries", "barchart"] },
    { id: "custom.hideFrom", name: "Series › Hide in area", item: { kind: "multi", choices: [c("legend", "Legend"), c("tooltip", "Tooltip"), c("viz", "Visualization")] } },
];

// the value a property starts with
const initialValue = (id: string): unknown => {
    if (id === "color") return { mode: "fixed", fixedColor: "blue" };
    if (id === "thresholds") return { mode: "absolute", steps: [{ value: null, color: "green" }, { value: 80, color: "red" }] };
    if (id === "mappings" || id === "links") return [];
    if (id === "custom.hideFrom") return { legend: false, tooltip: false, viz: false };
    if (id === "custom.lineWidth") return 2;
    if (id === "custom.fillOpacity") return 20;
    return undefined;
};

const PropertyControl: FC<{ property: OverrideProperty; info: PropertyInfo; onChange: (value: unknown) => void }> = ({ property, info, onChange }) => {
    if (property.id === "color") {
        const value = property.value as { fixedColor?: string } | undefined;
        return (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 12, color: "#c7cbd1" }}>{info.name}</span>
                <ColorSelect value={value?.fixedColor} label={info.name} onChange={(fixedColor) => onChange({ mode: "fixed", fixedColor })} />
            </div>
        );
    }
    if (property.id === "custom.hideFrom") {
        const value = (property.value ?? {}) as Record<string, boolean>;
        const list = Object.entries(value)
            .filter(([, v]) => v)
            .map(([k]) => k);
        return (
            <OptionControl
                item={{ ...info.item, label: info.name, path: property.id } as OptionItem}
                value={list}
                onChange={(next) => {
                    const chosen = next as string[];
                    onChange({ legend: chosen.includes("legend"), tooltip: chosen.includes("tooltip"), viz: chosen.includes("viz") });
                }}
            />
        );
    }
    return <OptionControl item={{ ...info.item, label: info.name, path: property.id } as OptionItem} value={property.value} onChange={onChange} />;
};

export interface OverridesEditorProps {
    overrides: FieldOverride[];
    seriesNames: string[];
    viz: VizType;
    onChange: (overrides: FieldOverride[]) => void;
}

const OverridesEditor: FC<OverridesEditorProps> = ({ overrides, seriesNames, viz, onChange }) => {
    const [adding, setAdding] = useState<string>("");
    const update = (i: number, next: FieldOverride) => onChange(overrides.map((o, j) => (j === i ? next : o)));
    const properties = OVERRIDE_PROPERTIES.filter((p) => !p.viz || p.viz.includes(viz));
    return (
        <div style={{ paddingTop: 8 }}>
            {overrides.length === 0 && <p style={{ margin: "0 0 12px", color: "#9aa1aa", fontSize: 12 }}>Settings for some series only, over the ones of the panel.</p>}
            {overrides.map((o, i) => (
                <Card key={i} aria-label={`Override ${i + 1}`}>
                    <Head>
                        <strong>Override {i + 1}</strong>
                        <span style={{ flex: 1 }} />
                        <Icon type="button" aria-label={`Remove override ${i + 1}`} onClick={() => onChange(overrides.filter((_, j) => j !== i))}>
                            <Trash2 aria-hidden="true" />
                        </Icon>
                    </Head>
                    <div style={{ display: "flex", gap: 6 }}>
                        <Select aria-label={`Matcher of override ${i + 1}`} value={o.matcher.id} style={{ width: 180, flex: "none" }} onChange={(e) => update(i, { ...o, matcher: { id: e.target.value as FieldOverride["matcher"]["id"], options: o.matcher.options } })}>
                            <option value="byName">Fields with name</option>
                            <option value="byRegexp">Name matching regex</option>
                        </Select>
                        {o.matcher.id === "byName" ? (
                            <Select aria-label={`Series of override ${i + 1}`} value={o.matcher.options} onChange={(e) => update(i, { ...o, matcher: { ...o.matcher, options: e.target.value } })}>
                                {!seriesNames.includes(o.matcher.options) && <option value={o.matcher.options}>{o.matcher.options || "Choose a series"}</option>}
                                {seriesNames.map((n) => (
                                    <option key={n} value={n}>
                                        {n}
                                    </option>
                                ))}
                            </Select>
                        ) : (
                            <Input aria-label={`Regular expression of override ${i + 1}`} placeholder="e.g. ^Line" value={o.matcher.options} onChange={(e) => update(i, { ...o, matcher: { ...o.matcher, options: e.target.value } })} />
                        )}
                    </div>
                    {o.properties.map((p, k) => {
                        const info = OVERRIDE_PROPERTIES.find((x) => x.id === p.id);
                        if (!info) return null;
                        return (
                            <div key={p.id} style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <PropertyControl property={p} info={info} onChange={(value) => update(i, { ...o, properties: o.properties.map((q, m) => (m === k ? { ...q, value } : q)) })} />
                                </div>
                                <Icon type="button" aria-label={`Remove ${info.name}`} onClick={() => update(i, { ...o, properties: o.properties.filter((_, m) => m !== k) })}>
                                    <Trash2 aria-hidden="true" />
                                </Icon>
                            </div>
                        );
                    })}
                    <Select
                        aria-label={`Add property to override ${i + 1}`}
                        value=""
                        onChange={(e) => {
                            const id = e.target.value;
                            if (!id || o.properties.some((p) => p.id === id)) return;
                            update(i, { ...o, properties: [...o.properties, { id, value: initialValue(id) }] });
                        }}
                    >
                        <option value="">+ Add override property</option>
                        {properties
                            .filter((p) => !o.properties.some((q) => q.id === p.id))
                            .map((p) => (
                                <option key={p.id} value={p.id}>
                                    {p.name}
                                </option>
                            ))}
                    </Select>
                </Card>
            ))}
            <div style={{ display: "flex", gap: 6 }}>
                <Select aria-label="Kind of the new override" value={adding} onChange={(e) => setAdding(e.target.value)} style={{ flex: 1 }}>
                    <option value="">Fields with name…</option>
                    {seriesNames.map((n) => (
                        <option key={n} value={n}>
                            {n}
                        </option>
                    ))}
                    <option value="__regex__">Fields with name matching regex</option>
                </Select>
                <Small
                    type="button"
                    onClick={() => {
                        const matcher: FieldOverride["matcher"] = adding === "__regex__" ? { id: "byRegexp", options: "" } : { id: "byName", options: adding || seriesNames[0] || "" };
                        onChange([...overrides, { matcher, properties: [] }]);
                        setAdding("");
                    }}
                >
                    <Plus aria-hidden="true" />
                    Add field override
                </Small>
            </div>
        </div>
    );
};

export default OverridesEditor;
