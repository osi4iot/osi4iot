// One animation of a Picture panel, as a card that reads as a sentence:
//   Element  needle
//   Topic    dtm2sim
//   Field    rotorRpm                                  (dev2pdb: chosen among its sensors' fields; else written)
//   Does     Rotate: when the value goes from 0 to 20, rotate from -90° to 90° about x 490, y 220
//   Now      11.4 → 12.6°
import { FC, ReactNode, useEffect, useState } from "react";
import styled from "styled-components";
import { Plus, Trash2, X } from "lucide-react";
import { LiveTopic, LiveValueStore, formatLiveValue, valueAt } from "./liveValues";
import { PICTURE_ACTIONS, PICTURE_COMPARE, PictureAction, PictureBinding, PictureCompare, bindingEffects } from "./pictureBindings";

const font = `Roboto, "Helvetica Neue", Arial, sans-serif`;

export const ACTION_LABEL: Record<PictureAction, string> = {
    text: "Show the value as text",
    color: "Change its colour by thresholds",
    rotate: "Rotate it",
    translateX: "Move it horizontally",
    translateY: "Move it vertically",
    scale: "Scale it",
    opacity: "Fade it (opacity)",
    visible: "Show it only when…",
};

// what each action is for: the element it suits
const ACTION_HINT: Record<PictureAction, string> = {
    text: "For a <text>: its text becomes the value.",
    color: "The fill (or the line) takes the colour of the highest threshold the value reaches.",
    rotate: "For a needle, a rotor…: the value is turned into an angle.",
    translateX: "For a cursor, a level…: the value is turned into a distance (units of the SVG).",
    translateY: "For a cursor, a level…: the value is turned into a distance (units of the SVG; down is positive).",
    scale: "The value is turned into a size factor (1 = as drawn).",
    opacity: "The value is turned into an opacity (0 transparent, 1 as drawn).",
    visible: "For a warning: shown while the condition holds, hidden otherwise (and while there is no value).",
};

// a new animation, with values that already do something
export const newBinding = (element: string, topicRef: string, action: PictureAction = "text", path = ""): PictureBinding => {
    const b: PictureBinding = { element, topicRef, path, action };
    if (action === "text") b.decimals = 1;
    if (action === "color") {
        b.target = "fill";
        b.thresholds = [
            { value: null, color: "#73bf69" },
            { value: 80, color: "#f2495c" },
        ];
    }
    if (action === "rotate") Object.assign(b, { inMin: 0, inMax: 100, outMin: 0, outMax: 180 });
    if (action === "translateX" || action === "translateY") Object.assign(b, { inMin: 0, inMax: 100, outMin: 0, outMax: 100 });
    if (action === "scale") Object.assign(b, { inMin: 0, inMax: 100, outMin: 1, outMax: 2 });
    if (action === "opacity") Object.assign(b, { inMin: 0, inMax: 100, outMin: 0.2, outMax: 1 });
    if (action === "visible") Object.assign(b, { op: ">", value: 0 });
    return b;
};

const Card = styled.div<{ $active: boolean }>`
    display: grid;
    grid-template-columns: 74px minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px 10px;
    padding: 10px 12px;
    border: 1px solid ${({ $active }) => ($active ? "#3d82f0" : "#262a2f")};
    border-radius: 10px;
    background: #121417;
    font: 400 13px ${font};

    > .key {
        color: #9aa1aa;
        font-size: 12px;
        font-weight: 600;
    }
    > .remove {
        grid-column: 3;
        grid-row: 1;
    }
`;

const Line = styled.div`
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    min-width: 0;
    color: #c7cbd1;

    .word {
        color: #9aa1aa;
    }
    .hint {
        flex-basis: 100%;
        color: #7d848d;
        font-size: 12px;
    }
`;

const Chip = styled.button`
    height: 24px;
    padding: 0 8px;
    background: #1b1e22;
    border: 1px solid #2c3137;
    border-radius: 12px;
    color: #c7cbd1;
    font: 400 12px ui-monospace, SFMono-Regular, Menlo, monospace;
    cursor: pointer;

    &:hover,
    &:focus-visible {
        border-color: #3d82f0;
        outline: none;
    }
`;

const Now = styled.span<{ $missing: boolean }>`
    color: ${({ $missing }) => ($missing ? "#7d848d" : "#8ab4ff")};
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 12px;
`;

const IconButton = styled.button`
    width: 28px;
    height: 28px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 7px;
    color: #9aa1aa;
    cursor: pointer;

    &:hover,
    &:focus-visible {
        border-color: #2c3137;
        color: #e6e8eb;
    }
    svg {
        width: 14px;
        height: 14px;
    }
`;

export const NumberField: FC<{ label: string; value: number | undefined; onChange: (v: number | undefined) => void; step?: number; placeholder?: string; width?: number }> = ({
    label,
    value,
    onChange,
    step,
    placeholder,
    width = 70,
}) => (
    <input
        type="number"
        aria-label={label}
        title={label}
        placeholder={placeholder}
        step={step ?? "any"}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
        style={{ width }}
    />
);

// a colour as #rrggbb (or a CSS name): the picker and the text, kept together
export const ColorField: FC<{ label: string; value: string; onChange: (color: string) => void }> = ({ label, value, onChange }) => {
    const [text, setText] = useState(value);
    useEffect(() => setText(value), [value]);
    const valid = (c: string) => /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(c) || /^[a-zA-Z]{3,20}$/.test(c);
    const hex6 = /^#[0-9a-fA-F]{6}$/.test(value)
        ? value
        : /^#[0-9a-fA-F]{3}$/.test(value)
          ? `#${value
                .slice(1)
                .split("")
                .map((c) => c + c)
                .join("")}`
          : "#73bf69";
    return (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
            <input type="color" aria-label={`${label}: picker`} value={hex6} onChange={(e) => onChange(e.target.value)} style={{ width: 30, padding: 2 }} />
            <input
                aria-label={label}
                title="#rrggbb, #rgb or a colour name (red, orange…)"
                value={text}
                maxLength={20}
                aria-invalid={!valid(text)}
                onChange={(e) => {
                    const c = e.target.value.trim();
                    setText(c);
                    if (valid(c)) onChange(c.toLowerCase());
                }}
                style={{ width: 80, fontFamily: "ui-monospace, Menlo, monospace", borderColor: valid(text) ? undefined : "#f2495c" }}
            />
        </span>
    );
};

// the field of the value: chosen among the sensors' fields (dev2pdb) or written (dtm2sim, dev2sim), with those
// seen in the messages offered
const FieldInput: FC<{ topic: LiveTopic | undefined; topicRef: string; value: string; seen: string[]; onChange: (path: string) => void }> = ({
    topic,
    topicRef,
    value,
    seen,
    onChange,
}) => {
    if (topic?.fields && topic.fields.length > 0) {
        const known = topic.fields.some((f) => f.path === value);
        return (
            <select aria-label="Field" value={known ? value : ""} onChange={(e) => onChange(e.target.value)} style={{ minWidth: 220, color: known ? undefined : "#9aa1aa" }}>
                <option value="">Choose a sensor field…</option>
                {topic.fields.map((f) => (
                    <option key={f.path} value={f.path}>
                        {f.label}
                        {f.units && f.units !== "-" ? ` (${f.units})` : ""} — {f.sensor} · {f.path}
                    </option>
                ))}
            </select>
        );
    }
    const suggestions = seen.filter((s) => s !== value && !/(^|\.)\d+(\.|$)/.test(s)).slice(0, 8);
    return (
        <>
            <input
                aria-label="Field"
                placeholder="the field's name, e.g. rotorRpm or pose.distance"
                value={value}
                spellCheck={false}
                onChange={(e) => onChange(e.target.value.trim())}
                style={{ width: 300, fontFamily: "ui-monospace, Menlo, monospace" }}
            />
            {suggestions.length > 0 && (
                <span className="hint">
                    Seen in {topicRef}:{" "}
                    {suggestions.map((s) => (
                        <Chip key={s} type="button" onClick={() => onChange(s)} style={{ marginRight: 4 }}>
                            {s}
                        </Chip>
                    ))}
                </span>
            )}
            {suggestions.length === 0 && !value && <span className="hint">Write the name of the field as the pipeline or the device sends it (a field inside another: a.b).</span>}
        </>
    );
};

// what the value does now: "11.4 → 12.6°"
const nowText = (b: PictureBinding, store?: LiveValueStore): { text: string; missing: boolean } => {
    if (!b.path) return { text: "choose the field of the value", missing: true };
    const raw = valueAt(store?.get(b.topicRef)?.payload, b.path.split("."));
    if (raw === undefined || raw === null) return { text: `no value of ${b.topicRef}.${b.path} yet`, missing: true };
    const e = bindingEffects([b], store!.get).get(b.element) ?? {};
    const value = formatLiveValue(raw);
    const r = (v: number | undefined) => (v === undefined ? "–" : String(Math.round(v * 100) / 100));
    const out =
        b.action === "text"
            ? `“${e.text ?? ""}”`
            : b.action === "color"
              ? e.fill ?? e.stroke ?? "(no colour)"
              : b.action === "rotate"
                ? `${r(e.rotate)}°`
                : b.action === "translateX"
                  ? `x + ${r(e.translateX)}`
                  : b.action === "translateY"
                    ? `y + ${r(e.translateY)}`
                    : b.action === "scale"
                      ? `× ${r(e.scale)}`
                      : b.action === "opacity"
                        ? `opacity ${r(e.opacity)}`
                        : e.visible
                          ? "shown"
                          : "hidden";
    return { text: `${value} → ${out}`, missing: false };
};

export interface BindingCardProps {
    index: number;
    binding: PictureBinding;
    elements: { id: string; tag: string }[];
    topics: LiveTopic[];
    seen: string[];
    store?: LiveValueStore;
    active: boolean;
    onChange: (patch: Partial<PictureBinding>) => void;
    onAction: (action: PictureAction) => void;
    onRemove: () => void;
    onHover: (hover: boolean) => void;
}

export const BindingCard: FC<BindingCardProps> = ({ index, binding: b, elements, topics, seen, store, active, onChange, onAction, onRemove, onHover }) => {
    const topic = topics.find((t) => t.ref === b.topicRef);
    const now = nowText(b, store);
    const range = (input: string, output: string, unit: ReactNode, outStep?: number) => (
        <>
            <span className="word">when the value goes from</span>
            <NumberField label="Value from" value={b.inMin} onChange={(v) => onChange({ inMin: v })} />
            <span className="word">to</span>
            <NumberField label="Value to" value={b.inMax} onChange={(v) => onChange({ inMax: v })} />
            <span className="word">, {input} from</span>
            <NumberField label={`${output} from`} value={b.outMin} step={outStep} onChange={(v) => onChange({ outMin: v })} />
            <span className="word">to</span>
            <NumberField label={`${output} to`} value={b.outMax} step={outStep} onChange={(v) => onChange({ outMax: v })} />
            {unit}
        </>
    );
    return (
        <Card $active={active} role="group" aria-label={`Animation ${index + 1}`} onMouseEnter={() => onHover(true)} onMouseLeave={() => onHover(false)}>
            <span className="key">Element</span>
            <Line>
                <select aria-label="Element" value={b.element} onChange={(e) => onChange({ element: e.target.value })} style={{ minWidth: 180 }}>
                    {!elements.some((x) => x.id === b.element) && <option value={b.element}>{b.element || "—"}</option>}
                    {elements.map((x) => (
                        <option key={x.id} value={x.id}>
                            {x.id} ({x.tag})
                        </option>
                    ))}
                </select>
            </Line>
            <IconButton className="remove" type="button" aria-label={`Remove animation ${index + 1}`} onClick={onRemove}>
                <Trash2 aria-hidden="true" />
            </IconButton>

            <span className="key">Topic</span>
            <Line style={{ gridColumn: "2 / span 2" }}>
                <select aria-label="Topic" value={b.topicRef} onChange={(e) => onChange({ topicRef: e.target.value, path: "" })} style={{ maxWidth: "100%" }}>
                    {!topic && <option value={b.topicRef}>{b.topicRef}</option>}
                    {topics.map((t) => (
                        <option key={t.ref} value={t.ref}>
                            {t.label}
                        </option>
                    ))}
                </select>
            </Line>

            <span className="key">Field</span>
            <Line style={{ gridColumn: "2 / span 2" }}>
                <FieldInput topic={topic} topicRef={b.topicRef} value={b.path} seen={seen} onChange={(path) => onChange({ path })} />
            </Line>

            <span className="key">Does</span>
            <Line style={{ gridColumn: "2 / span 2" }}>
                <select aria-label="Action" value={b.action} onChange={(e) => onAction(e.target.value as PictureAction)}>
                    {PICTURE_ACTIONS.map((a) => (
                        <option key={a} value={a}>
                            {ACTION_LABEL[a]}
                        </option>
                    ))}
                </select>
                {b.action === "text" && (
                    <>
                        <span className="word">as</span>
                        <input aria-label="Text before" placeholder="before" value={b.prefix ?? ""} maxLength={20} onChange={(e) => onChange({ prefix: e.target.value })} style={{ width: 80 }} />
                        <span className="word">value with</span>
                        <NumberField label="Decimals" value={b.decimals} step={1} width={56} onChange={(v) => onChange({ decimals: v === undefined ? undefined : Math.max(0, Math.min(10, Math.round(v))) })} />
                        <span className="word">decimals</span>
                        <input aria-label="Text after" placeholder="after, e.g. ' rpm'" value={b.suffix ?? ""} maxLength={20} onChange={(e) => onChange({ suffix: e.target.value })} style={{ width: 110 }} />
                    </>
                )}
                {b.action === "color" && (
                    <>
                        <span className="word">of its</span>
                        <select aria-label="Colour of" value={b.target ?? "fill"} onChange={(e) => onChange({ target: e.target.value as "fill" | "stroke" })}>
                            <option value="fill">fill</option>
                            <option value="stroke">line</option>
                        </select>
                    </>
                )}
                {b.action === "rotate" && range("rotate it", "Degrees", <span className="word">degrees</span>)}
                {(b.action === "translateX" || b.action === "translateY") && range("move it", "Distance", <span className="word">units</span>)}
                {b.action === "scale" && range("scale it", "Factor", <span className="word">times</span>, 0.1)}
                {b.action === "opacity" && range("its opacity goes", "Opacity", null, 0.1)}
                {b.action === "visible" && (
                    <>
                        <span className="word">the value is</span>
                        <select aria-label="Comparison" value={b.op ?? ">"} onChange={(e) => onChange({ op: e.target.value as PictureCompare })}>
                            {PICTURE_COMPARE.map((op) => (
                                <option key={op} value={op}>
                                    {op}
                                </option>
                            ))}
                        </select>
                        <NumberField label="Value" value={b.value} onChange={(v) => onChange({ value: v })} />
                    </>
                )}
                <span className="hint">{ACTION_HINT[b.action]}</span>
            </Line>

            {b.action === "color" && (
                <>
                    <span className="key">Colours</span>
                    <Line style={{ gridColumn: "2 / span 2" }}>
                        {(b.thresholds ?? []).map((t, k) => (
                            <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 4, marginRight: 8 }}>
                                {t.value === null ? (
                                    <span className="word">below the rest</span>
                                ) : (
                                    <>
                                        <span className="word">from</span>
                                        <NumberField label={`Threshold ${k}`} value={t.value} onChange={(v) => onChange({ thresholds: (b.thresholds ?? []).map((x, j) => (j === k ? { ...x, value: v ?? 0 } : x)) })} />
                                    </>
                                )}
                                <ColorField label={`Colour ${k}`} value={t.color} onChange={(color) => onChange({ thresholds: (b.thresholds ?? []).map((x, j) => (j === k ? { ...x, color } : x)) })} />
                                {t.value !== null && (
                                    <IconButton type="button" aria-label={`Remove threshold ${k}`} onClick={() => onChange({ thresholds: (b.thresholds ?? []).filter((_, j) => j !== k) })}>
                                        <X aria-hidden="true" />
                                    </IconButton>
                                )}
                            </span>
                        ))}
                        <IconButton
                            type="button"
                            aria-label="Add a threshold"
                            title="Add a threshold"
                            onClick={() => {
                                const last = Math.max(0, ...(b.thresholds ?? []).map((t) => t.value ?? 0));
                                onChange({ thresholds: [...(b.thresholds ?? []), { value: last + 10, color: "#f2cc0c" }].slice(0, 20) });
                            }}
                        >
                            <Plus aria-hidden="true" />
                        </IconButton>
                    </Line>
                </>
            )}

            {(b.action === "rotate" || b.action === "scale") && (
                <>
                    <span className="key">About</span>
                    <Line style={{ gridColumn: "2 / span 2" }}>
                        <span className="word">x</span>
                        <NumberField label="Centre x" placeholder="centre" value={b.cx} onChange={(v) => onChange({ cx: v })} />
                        <span className="word">y</span>
                        <NumberField label="Centre y" placeholder="centre" value={b.cy} onChange={(v) => onChange({ cy: v })} />
                        <span className="hint">The point it turns or grows about, in units of the SVG. Empty: the centre of the element (a needle needs its axis).</span>
                    </Line>
                </>
            )}

            <span className="key">Now</span>
            <Line style={{ gridColumn: "2 / span 2" }}>
                <Now $missing={now.missing}>{now.text}</Now>
            </Line>
        </Card>
    );
};
