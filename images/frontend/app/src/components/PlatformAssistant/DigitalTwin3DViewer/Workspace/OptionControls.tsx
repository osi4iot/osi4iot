// The controls of the options pane of the panel editor: one per kind of option (radio buttons, switches,
// sliders, units, colours, thresholds, value mappings, calculations), styled as the rest of the Viewer.
import { FC, ReactElement, useEffect, useId, useState } from "react";
import styled from "styled-components";
import { Plus, Trash2 } from "lucide-react";
import { COLOR_CHOICES, NAMED_COLORS, Thresholds, UNITS, ValueMapping, resolveColor, sortedSteps, unitName } from "./chartConfig";
import { CALC_CHOICES, OptionItem } from "./optionsSchema";

const font = `Roboto, "Helvetica Neue", Arial, sans-serif`;

export const Field = styled.div`
    display: flex;
    flex-direction: column;
    gap: 6px;

    > label,
    > span.label {
        font-size: 12px;
        color: #c7cbd1;
    }

    > small {
        margin-top: -2px;
        font-size: 11px;
        color: #8b929b;
    }
`;

export const inputCss = `
    height: 32px;
    box-sizing: border-box;
    padding: 0 10px;
    background: #0e1013;
    border: 1px solid #2c3137;
    border-radius: 7px;
    color: #e6e8eb;
    font: 400 13px ${font};

    &:focus {
        outline: none;
        border-color: #3d82f0;
    }
`;

export const Input = styled.input`
    ${inputCss}
    width: 100%;
`;

export const Select = styled.select`
    ${inputCss}
    width: 100%;
`;

const TextArea = styled.textarea`
    ${inputCss}
    width: 100%;
    height: 64px;
    padding: 8px 10px;
    resize: vertical;
`;

const Segment = styled.div`
    align-self: flex-start;
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
    padding: 2px;
    background: #0e1013;
    border: 1px solid #262a2f;
    border-radius: 7px;
`;

const SegmentButton = styled.button<{ $on: boolean }>`
    height: 26px;
    padding: 0 9px;
    border: none;
    border-radius: 5px;
    background: ${({ $on }) => ($on ? "#2b3a52" : "transparent")};
    color: ${({ $on }) => ($on ? "#e6efff" : "#9aa1aa")};
    font: ${({ $on }) => ($on ? 600 : 500)} 12px ${font};
    cursor: pointer;

    &:focus-visible {
        outline: 2px solid #3d82f0;
    }
`;

const SwitchButton = styled.button<{ $on: boolean }>`
    width: 36px;
    height: 20px;
    padding: 2px;
    border: none;
    border-radius: 10px;
    cursor: pointer;
    display: flex;
    justify-content: ${({ $on }) => ($on ? "flex-end" : "flex-start")};
    background: ${({ $on }) => ($on ? "#3d82f0" : "#3a4048")};

    span {
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: #fff;
    }

    &:focus-visible {
        outline: 2px solid #3d82f0;
        outline-offset: 2px;
    }
`;

const Row = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
`;

const SmallButton = styled.button`
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

const IconButton = styled.button`
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

const Swatch = styled.span<{ $color: string }>`
    width: 18px;
    height: 18px;
    flex: none;
    border-radius: 50%;
    background: ${({ $color }) => $color};
    border: 1px solid rgba(255, 255, 255, 0.15);
`;

const Chips = styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
`;

const Chip = styled.button<{ $on: boolean }>`
    height: 26px;
    padding: 0 9px;
    border-radius: 13px;
    border: 1px solid ${({ $on }) => ($on ? "#3d82f0" : "#2c3137")};
    background: ${({ $on }) => ($on ? "#23324a" : "transparent")};
    color: ${({ $on }) => ($on ? "#e6efff" : "#9aa1aa")};
    font: 500 12px ${font};
    cursor: pointer;
`;

// a number field that keeps what the user types until it is a number (empty: none)
const NumberField: FC<{ id: string; value: unknown; placeholder?: string; min?: number; max?: number; onChange: (v: number | undefined) => void }> = ({
    id,
    value,
    placeholder,
    min,
    max,
    onChange,
}) => {
    const [text, setText] = useState(typeof value === "number" ? String(value) : "");
    useEffect(() => setText(typeof value === "number" ? String(value) : ""), [value]);
    return (
        <Input
            id={id}
            type="number"
            inputMode="decimal"
            value={text}
            placeholder={placeholder}
            min={min}
            max={max}
            onChange={(e) => {
                setText(e.target.value);
                if (e.target.value === "") onChange(undefined);
                else if (Number.isFinite(Number(e.target.value))) onChange(Number(e.target.value));
            }}
        />
    );
};

export const ColorSelect: FC<{ id?: string; value: string | undefined; onChange: (v: string) => void; label: string; allowNone?: boolean }> = ({ id, value, onChange, label, allowNone }) => (
    <Row>
        <Swatch $color={resolveColor(value, "transparent")} aria-hidden="true" />
        <Select id={id} aria-label={label} value={value && !NAMED_COLORS[value] && !COLOR_CHOICES.includes(value) ? "custom" : value ?? ""} onChange={(e) => onChange(e.target.value === "custom" ? "#5794F2" : e.target.value)}>
            {allowNone && <option value="">Automatic</option>}
            {COLOR_CHOICES.map((c) => (
                <option key={c} value={c}>
                    {c}
                </option>
            ))}
            <option value="custom">Custom…</option>
        </Select>
        {value && value.startsWith("#") && <Input type="color" aria-label={`${label}: custom colour`} value={value.slice(0, 7)} onChange={(e) => onChange(e.target.value)} style={{ width: 44, padding: 2 }} />}
    </Row>
);

const ThresholdsEditor: FC<{ value: Thresholds | undefined; onChange: (v: Thresholds) => void }> = ({ value, onChange }) => {
    const thresholds: Thresholds = value ?? { mode: "absolute", steps: [{ value: null, color: "green" }] };
    const steps = sortedSteps(thresholds.steps);
    const update = (next: Thresholds["steps"]) => onChange({ ...thresholds, steps: next });
    // the highest first, as Grafana
    const shown = [...steps].reverse();
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <SmallButton
                type="button"
                onClick={() => {
                    const top = steps.filter((s) => s.value !== null).map((s) => s.value as number);
                    const next = top.length ? Math.max(...top) + 10 : 80;
                    const colors = ["red", "orange", "yellow", "purple", "blue"];
                    update([...steps, { value: next, color: colors[steps.length % colors.length] }]);
                }}
            >
                <Plus aria-hidden="true" />
                Add threshold
            </SmallButton>
            {shown.map((step, i) => {
                const index = steps.length - 1 - i;
                return (
                    <Row key={index}>
                        <div style={{ width: 150 }}>
                            <ColorSelect value={step.color} label={`Colour of threshold ${step.value ?? "Base"}`} onChange={(color) => update(steps.map((s, j) => (j === index ? { ...s, color } : s)))} />
                        </div>
                        {step.value === null ? (
                            <Input value="Base" readOnly aria-label="Base threshold" style={{ flex: 1, color: "#9aa1aa" }} />
                        ) : (
                            <Input
                                type="number"
                                aria-label="Threshold value"
                                defaultValue={step.value}
                                style={{ flex: 1 }}
                                onBlur={(e) => {
                                    const v = Number(e.target.value);
                                    if (Number.isFinite(v)) update(steps.map((s, j) => (j === index ? { ...s, value: v } : s)));
                                }}
                            />
                        )}
                        {step.value !== null && (
                            <IconButton type="button" aria-label={`Remove threshold ${step.value}`} onClick={() => update(steps.filter((_, j) => j !== index))}>
                                <Trash2 aria-hidden="true" />
                            </IconButton>
                        )}
                    </Row>
                );
            })}
            <span style={{ fontSize: 12, color: "#c7cbd1", marginTop: 4 }}>Thresholds mode</span>
            <Segment role="radiogroup" aria-label="Thresholds mode">
                {(["absolute", "percentage"] as const).map((m) => (
                    <SegmentButton key={m} type="button" role="radio" aria-checked={thresholds.mode === m} $on={thresholds.mode === m} onClick={() => onChange({ ...thresholds, mode: m })}>
                        {m === "absolute" ? "Absolute" : "Percentage"}
                    </SegmentButton>
                ))}
            </Segment>
        </div>
    );
};

const MappingsEditor: FC<{ value: ValueMapping[] | undefined; onChange: (v: ValueMapping[]) => void }> = ({ value, onChange }) => {
    const mappings = value ?? [];
    const update = (i: number, patch: Partial<ValueMapping>) => onChange(mappings.map((m, j) => (j === i ? { ...m, ...patch } : m)));
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {mappings.map((m, i) => (
                <div key={i} style={{ display: "flex", flexDirection: "column", gap: 6, padding: 8, border: "1px solid #262a2f", borderRadius: 8 }}>
                    <Row>
                        <Select aria-label="Type of mapping" value={m.type} onChange={(e) => update(i, { type: e.target.value as ValueMapping["type"] })} style={{ width: 110 }}>
                            <option value="value">Value</option>
                            <option value="range">Range</option>
                        </Select>
                        {m.type === "value" ? (
                            <Input aria-label="Value" placeholder="Value" value={m.value ?? ""} onChange={(e) => update(i, { value: e.target.value })} />
                        ) : (
                            <>
                                <Input aria-label="From" type="number" placeholder="From" value={m.from ?? ""} onChange={(e) => update(i, { from: e.target.value === "" ? null : Number(e.target.value) })} />
                                <Input aria-label="To" type="number" placeholder="To" value={m.to ?? ""} onChange={(e) => update(i, { to: e.target.value === "" ? null : Number(e.target.value) })} />
                            </>
                        )}
                        <IconButton type="button" aria-label="Remove mapping" onClick={() => onChange(mappings.filter((_, j) => j !== i))}>
                            <Trash2 aria-hidden="true" />
                        </IconButton>
                    </Row>
                    <Row>
                        <Input aria-label="Display text" placeholder="Display text" value={m.text ?? ""} onChange={(e) => update(i, { text: e.target.value })} />
                        <div style={{ width: 150, flex: "none" }}>
                            <ColorSelect value={m.color} allowNone label="Colour of the mapping" onChange={(color) => update(i, { color: color || undefined })} />
                        </div>
                    </Row>
                </div>
            ))}
            <SmallButton type="button" onClick={() => onChange([...mappings, { type: "value", value: "", text: "" }])}>
                <Plus aria-hidden="true" />
                Add value mapping
            </SmallButton>
        </div>
    );
};

export interface OptionControlProps {
    item: OptionItem;
    value: unknown;
    onChange: (value: unknown) => void;
}

// One option of the pane, with its label
export const OptionControl: FC<OptionControlProps> = ({ item, value, onChange }) => {
    const id = useId();
    const { kind, label, description } = item;
    const labelEl = kind === "radio" || kind === "calcs" || kind === "thresholds" || kind === "mappings" || kind === "switch" ? <span className="label" id={id}>{label}</span> : <label htmlFor={id}>{label}</label>;
    let control: ReactElement;
    switch (kind) {
        case "text":
            control = <Input id={id} value={(value as string) ?? ""} placeholder={item.placeholder} onChange={(e) => onChange(e.target.value || undefined)} />;
            break;
        case "textarea":
            control = <TextArea id={id} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value || undefined)} />;
            break;
        case "number":
            control = <NumberField id={id} value={value} placeholder={item.placeholder} min={item.min} max={item.max} onChange={onChange} />;
            break;
        case "radio":
            control = (
                <Segment role="radiogroup" aria-labelledby={id}>
                    {item.choices!.map((choice) => (
                        <SegmentButton key={String(choice.value)} type="button" role="radio" aria-checked={value === choice.value} $on={value === choice.value} onClick={() => onChange(choice.value)}>
                            {choice.label}
                        </SegmentButton>
                    ))}
                </Segment>
            );
            break;
        case "select":
            control = (
                <Select id={id} value={String(value ?? "")} onChange={(e) => onChange(item.choices!.find((c) => String(c.value) === e.target.value)?.value)}>
                    {item.choices!.map((choice) => (
                        <option key={String(choice.value)} value={String(choice.value)}>
                            {choice.label}
                        </option>
                    ))}
                </Select>
            );
            break;
        case "switch":
            control = (
                <SwitchButton type="button" role="switch" aria-checked={value === true} aria-labelledby={id} $on={value === true} onClick={() => onChange(!(value === true))}>
                    <span aria-hidden="true" />
                </SwitchButton>
            );
            break;
        case "slider": {
            const v = typeof value === "number" ? value : item.min ?? 0;
            control = (
                <Row>
                    <input id={id} type="range" min={item.min} max={item.max} step={item.step} value={v} onChange={(e) => onChange(Number(e.target.value))} style={{ flex: 1, accentColor: "#3d82f0" }} />
                    <Input aria-label={`${label} value`} type="number" min={item.min} max={item.max} step={item.step} value={v} onChange={(e) => e.target.value !== "" && onChange(Number(e.target.value))} style={{ width: 64 }} />
                </Row>
            );
            break;
        }
        case "unit":
            control = (
                <>
                    <Select id={id} value={typeof value === "string" ? (value.startsWith("suffix:") ? "custom" : value) : ""} onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value === "custom" ? "suffix:" : e.target.value)}>
                        <option value="">Auto (units of the sensor)</option>
                        {Array.from(new Set(UNITS.map((u) => u.group))).map((group) => (
                            <optgroup key={group} label={group}>
                                {UNITS.filter((u) => u.group === group).map((u) => (
                                    <option key={u.id} value={u.id}>
                                        {u.name}
                                    </option>
                                ))}
                            </optgroup>
                        ))}
                        <option value="custom">Custom suffix…</option>
                    </Select>
                    {typeof value === "string" && value.startsWith("suffix:") && (
                        <Input aria-label="Custom unit" placeholder="Suffix, e.g. pcs" value={value.slice(7)} onChange={(e) => onChange(`suffix:${e.target.value}`)} />
                    )}
                    <small style={{ color: "#8b929b", fontSize: 11 }}>{unitName(value as string | undefined)}</small>
                </>
            );
            break;
        case "color":
            control = <ColorSelect id={id} value={value as string | undefined} label={label} onChange={onChange} />;
            break;
        case "thresholds":
            control = <ThresholdsEditor value={value as Thresholds | undefined} onChange={onChange} />;
            break;
        case "mappings":
            control = <MappingsEditor value={value as ValueMapping[] | undefined} onChange={onChange} />;
            break;
        case "calcs": {
            const list = (value as string[] | undefined) ?? [];
            control = (
                <Chips role="group" aria-labelledby={id}>
                    {CALC_CHOICES.filter((c) => c.value !== "first" && c.value !== "last").map((choice) => {
                        const on = list.includes(String(choice.value));
                        return (
                            <Chip key={String(choice.value)} type="button" $on={on} aria-pressed={on} onClick={() => onChange(on ? list.filter((x) => x !== choice.value) : [...list, String(choice.value)])}>
                                {choice.label}
                            </Chip>
                        );
                    })}
                </Chips>
            );
            break;
        }
        case "calc": {
            const current = ((value as string[] | undefined) ?? ["lastNotNull"])[0];
            control = (
                <Select id={id} value={current} onChange={(e) => onChange([e.target.value])}>
                    {CALC_CHOICES.map((choice) => (
                        <option key={String(choice.value)} value={String(choice.value)}>
                            {choice.label}
                        </option>
                    ))}
                </Select>
            );
            break;
        }
        default:
            control = <span />;
    }
    return (
        <Field>
            {labelEl}
            {description && kind !== "unit" && <small>{description}</small>}
            {control}
        </Field>
    );
};
