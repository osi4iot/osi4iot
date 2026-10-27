// Controles del inspector del visor (sustituyen a react-dat-gui): interruptor, deslizador con valor
// editable, desplegable, sección plegable, botón de icono y fila de colección.
import { FC, KeyboardEvent, ReactNode, useEffect, useRef, useState } from "react";
import styled from "styled-components";
import { ChevronRight, Minus, Plus } from "lucide-react";

export const inspectorColors = {
    surface: "rgba(20, 22, 26, 0.94)",
    surfaceSolid: "#14161a",
    raised: "#1a1e24",
    field: "#0f1114",
    hover: "#232830",
    selected: "#232a35",
    border: "rgba(255, 255, 255, 0.08)",
    divider: "rgba(255, 255, 255, 0.07)",
    track: "#2a2f37",
    switchOff: "#353b45",
    text: "#e6e8eb",
    textSecondary: "#c3c9d1",
    textMuted: "#9aa3ad",
    textDisabled: "#7d8590",
    accent: "#3d82f0",
    accentStrong: "#3274d9",
    accentHover: "#2461c0",
    accentSoft: "rgba(61, 130, 240, 0.16)",
    accentText: "#8fb8ff",
    focus: "#6ea3ff",
    ok: "#62f700",
    okText: "#9be86a",
    danger: "#ff6b6b",
};

const c = inspectorColors;

export const focusRing = `
    &:focus-visible {
        outline: 2px solid ${c.focus};
        outline-offset: 2px;
    }
`;

const decimalsOf = (step: number) => {
    if (!isFinite(step) || step >= 1) return 0;
    const text = String(step);
    const exp = /e-(\d+)$/.exec(text);
    if (exp) return parseInt(exp[1], 10);
    return text.split(".")[1]?.length ?? 0;
};

export const formatNumber = (value: number, step: number) => {
    if (typeof value !== "number" || !isFinite(value)) return "-";
    return value.toFixed(decimalsOf(step));
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const snapToStep = (value: number, min: number, step: number) => {
    if (!step || step <= 0) return value;
    const snapped = min + Math.round((value - min) / step) * step;
    return parseFloat(snapped.toFixed(decimalsOf(step) + 2));
};

// ---------------------------------------------------------------- Switch

const SwitchButton = styled.button<{ $on: boolean }>`
    position: relative;
    flex: none;
    width: 36px;
    height: 20px;
    padding: 0;
    border: 0;
    border-radius: 10px;
    background-color: ${({ $on }) => ($on ? c.accent : c.switchOff)};
    cursor: pointer;
    transition: background-color 0.15s;
    ${focusRing}

    &::after {
        content: "";
        position: absolute;
        top: 2px;
        left: ${({ $on }) => ($on ? "18px" : "2px")};
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background-color: #ffffff;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
        transition: left 0.15s;
    }

    &:disabled {
        cursor: default;
        opacity: 0.5;
    }
`;

interface SwitchProps {
    checked: boolean;
    onChange: (checked: boolean) => void;
    label: string;
    disabled?: boolean;
}

export const Switch: FC<SwitchProps> = ({ checked, onChange, label, disabled }) => (
    <SwitchButton
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        $on={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
    />
);

// ---------------------------------------------------------------- Filas

const Row = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 40px;
    padding: 0 6px 0 28px;
`;

const RowLabel = styled.span`
    font-size: 13px;
    color: ${c.textSecondary};
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
`;

export const SwitchRow: FC<SwitchProps> = (props) => (
    <Row>
        <RowLabel>{props.label}</RowLabel>
        <Switch {...props} />
    </Row>
);

// ---------------------------------------------------------------- Slider

const SliderBlock = styled.div<{ $inset: boolean }>`
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: ${({ $inset }) => ($inset ? "6px 6px 8px 28px" : "8px 0")};
`;

const SliderValueGroup = styled.div`
    display: flex;
    align-items: center;
    gap: 4px;
    flex: none;
`;

const StepButton = styled.button`
    width: 26px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid ${c.border};
    border-radius: 6px;
    background-color: transparent;
    color: ${c.textSecondary};
    cursor: pointer;
    ${focusRing}

    &:hover:not(:disabled) {
        background-color: ${c.hover};
        color: ${c.text};
    }

    &:disabled {
        opacity: 0.35;
        cursor: default;
    }

    svg {
        width: 14px;
        height: 14px;
    }
`;

const RangeLimits = styled.div`
    display: flex;
    justify-content: space-between;
    font:
        11px "Roboto Mono",
        ui-monospace,
        monospace;
    color: ${c.textDisabled};
`;

const SliderHeader = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
`;

const ValueButton = styled.button`
    min-width: 52px;
    padding: 2px 8px;
    border-radius: 6px;
    border: 1px solid ${c.border};
    background-color: ${c.field};
    color: ${c.text};
    font:
        500 12px "Roboto Mono",
        ui-monospace,
        monospace;
    text-align: right;
    cursor: text;
    ${focusRing}

    &:hover {
        border-color: rgba(255, 255, 255, 0.2);
    }
`;

const ValueInput = styled.input`
    width: 72px;
    padding: 2px 8px;
    border-radius: 6px;
    border: 1px solid ${c.accent};
    background-color: ${c.field};
    color: ${c.text};
    font:
        500 12px "Roboto Mono",
        ui-monospace,
        monospace;
    text-align: right;
    outline: none;
`;

const Range = styled.input`
    -webkit-appearance: none;
    appearance: none;
    width: 100%;
    height: 20px;
    margin: 0;
    background: transparent;
    cursor: pointer;

    &::-webkit-slider-runnable-track {
        height: 4px;
        border-radius: 2px;
        background: var(--fill);
    }
    &::-moz-range-track {
        height: 4px;
        border-radius: 2px;
        background: ${c.track};
    }
    &::-moz-range-progress {
        height: 4px;
        border-radius: 2px;
        background: ${c.accent};
    }
    &::-webkit-slider-thumb {
        -webkit-appearance: none;
        width: 14px;
        height: 14px;
        margin-top: -5px;
        border-radius: 50%;
        background: #e8ecf2;
        border: 3px solid ${c.accent};
        box-sizing: border-box;
    }
    &::-moz-range-thumb {
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: #e8ecf2;
        border: 3px solid ${c.accent};
        box-sizing: border-box;
    }
    &:active::-webkit-slider-thumb {
        box-shadow: 0 0 0 5px rgba(61, 130, 240, 0.2);
    }
    &:focus-visible {
        outline: 2px solid ${c.focus};
        outline-offset: 2px;
        border-radius: 4px;
    }
`;

interface SliderFieldProps {
    id: string;
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    onChange: (value: number) => void;
    unit?: string;
    disabled?: boolean;
    // sangría de las filas dentro de una sección (false en ventanas como el simulador)
    inset?: boolean;
    // botones − / + de un paso y valores mínimo y máximo bajo la barra
    stepButtons?: boolean;
    showRange?: boolean;
}

export const SliderField: FC<SliderFieldProps> = ({
    id,
    label,
    value,
    min,
    max,
    step,
    onChange,
    unit,
    disabled,
    inset = true,
    stepButtons = false,
    showRange = false,
}) => {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);
    const safeValue = typeof value === "number" && isFinite(value) ? value : min;
    const percent = max > min ? ((clamp(safeValue, min, max) - min) / (max - min)) * 100 : 0;
    const display = `${formatNumber(safeValue, step)}${unit ? ` ${unit}` : ""}`;

    useEffect(() => {
        if (editing) inputRef.current?.select();
    }, [editing]);

    const commit = () => {
        setEditing(false);
        const parsed = parseFloat(draft.replace(",", "."));
        if (!isNaN(parsed)) onChange(snapToStep(clamp(parsed, min, max), min, step));
    };

    const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === "Enter") commit();
        if (event.key === "Escape") setEditing(false);
    };

    return (
        <SliderBlock $inset={inset} style={disabled ? { opacity: 0.45 } : undefined}>
            <SliderHeader>
                <RowLabel as="label" htmlFor={id}>
                    {label}
                </RowLabel>
                <SliderValueGroup>
                    {stepButtons && (
                        <StepButton
                            type="button"
                            aria-label={`Decrease ${label}`}
                            disabled={disabled || safeValue <= min}
                            onClick={() => onChange(snapToStep(clamp(safeValue - step, min, max), min, step))}
                        >
                            <Minus aria-hidden="true" />
                        </StepButton>
                    )}
                    {editing ? (
                        <ValueInput
                            ref={inputRef}
                            aria-label={`${label} value`}
                            value={draft}
                            inputMode="decimal"
                            onChange={(event) => setDraft(event.target.value)}
                            onBlur={commit}
                            onKeyDown={onKeyDown}
                        />
                    ) : (
                        <ValueButton
                            type="button"
                            aria-label={`${label}: ${display}. Click to type a value`}
                            disabled={disabled}
                            onClick={() => {
                                setDraft(formatNumber(safeValue, step));
                                setEditing(true);
                            }}
                        >
                            {display}
                        </ValueButton>
                    )}
                    {stepButtons && (
                        <StepButton
                            type="button"
                            aria-label={`Increase ${label}`}
                            disabled={disabled || safeValue >= max}
                            onClick={() => onChange(snapToStep(clamp(safeValue + step, min, max), min, step))}
                        >
                            <Plus aria-hidden="true" />
                        </StepButton>
                    )}
                </SliderValueGroup>
            </SliderHeader>
            <Range
                id={id}
                type="range"
                min={min}
                max={max}
                step={step}
                value={safeValue}
                disabled={disabled}
                style={{
                    ["--fill" as any]: `linear-gradient(to right, ${c.accent} ${percent}%, ${c.track} ${percent}%)`,
                }}
                onChange={(event) => onChange(parseFloat(event.target.value))}
            />
            {showRange && (
                <RangeLimits aria-hidden="true">
                    <span>{formatNumber(min, step)}</span>
                    <span>{formatNumber(max, step)}</span>
                </RangeLimits>
            )}
        </SliderBlock>
    );
};

// ---------------------------------------------------------------- Select

const Select = styled.select`
    width: 180px;
    max-width: 60%;
    height: 32px;
    padding: 0 28px 0 10px;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background-color: ${c.field};
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239aa3ad' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 10px center;
    color: ${c.text};
    font:
        13px Roboto,
        "Helvetica Neue",
        Arial,
        sans-serif;
    -webkit-appearance: none;
    appearance: none;
    text-overflow: ellipsis;
    cursor: pointer;
    ${focusRing}

    &:hover {
        border-color: rgba(255, 255, 255, 0.2);
    }

    option {
        background-color: #16191e;
        color: ${c.text};
    }
`;

interface SelectFieldProps {
    id: string;
    label: string;
    value: string;
    options: string[];
    onChange: (value: string) => void;
}

export const SelectField: FC<SelectFieldProps> = ({ id, label, value, options, onChange }) => {
    const list = options.includes(value) || value === undefined ? options : [value, ...options];
    return (
        <Row style={{ minHeight: 44 }}>
            <RowLabel as="label" htmlFor={id}>
                {label}
            </RowLabel>
            <Select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
                {list.map((option) => (
                    <option key={option} value={option}>
                        {option}
                    </option>
                ))}
            </Select>
        </Row>
    );
};

// ---------------------------------------------------------------- Section

const SectionContainer = styled.section`
    padding: 2px 12px;
`;

const SectionHeader = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    height: 40px;
    padding-right: 6px;
`;

const HeaderButton = styled.button`
    flex: 1;
    min-width: 0;
    height: 36px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 6px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: ${c.text};
    font:
        500 13px Roboto,
        "Helvetica Neue",
        Arial,
        sans-serif;
    text-align: left;
    cursor: pointer;
    ${focusRing}

    &:hover {
        background-color: ${c.hover};
    }
`;

export const Chevron = styled(ChevronRight)<{ $open: boolean }>`
    flex: none;
    width: 14px;
    height: 14px;
    color: ${c.textMuted};
    transition: transform 0.15s;
    transform: rotate(${({ $open }) => ($open ? 90 : 0)}deg);
`;

interface SectionProps {
    title: string;
    open: boolean;
    onToggle: () => void;
    // interruptor en la cabecera (p. ej. encender/apagar una luz): desactiva visualmente el contenido
    switchChecked?: boolean;
    onSwitchChange?: (checked: boolean) => void;
    children: ReactNode;
}

export const Section: FC<SectionProps> = ({ title, open, onToggle, switchChecked, onSwitchChange, children }) => {
    const hasSwitch = onSwitchChange !== undefined;
    const enabled = !hasSwitch || !!switchChecked;
    return (
        <SectionContainer>
            <SectionHeader>
                <HeaderButton type="button" aria-expanded={open} onClick={onToggle}>
                    <Chevron $open={open} aria-hidden="true" />
                    {title}
                </HeaderButton>
                {hasSwitch && <Switch checked={!!switchChecked} onChange={onSwitchChange!} label={title} />}
            </SectionHeader>
            {open && (
                <div style={enabled ? undefined : { opacity: 0.45 }} aria-disabled={!enabled}>
                    {children}
                </div>
            )}
        </SectionContainer>
    );
};

// ---------------------------------------------------------------- Botones

export const IconToggle = styled.button<{ $active: boolean }>`
    flex: none;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 0;
    border-radius: 7px;
    background-color: ${({ $active }) => ($active ? c.accentSoft : "transparent")};
    color: ${({ $active }) => ($active ? c.accentText : c.textDisabled)};
    cursor: pointer;
    ${focusRing}

    &:hover {
        background-color: ${({ $active }) => ($active ? "rgba(61, 130, 240, 0.24)" : c.hover)};
        color: ${({ $active }) => ($active ? c.accentText : c.textSecondary)};
    }

    svg {
        width: 16px;
        height: 16px;
    }
`;

export const PrimaryButton = styled.button`
    width: 100%;
    height: 36px;
    border: 0;
    border-radius: 8px;
    background-color: ${c.accentStrong};
    color: #ffffff;
    font:
        500 13px Roboto,
        "Helvetica Neue",
        Arial,
        sans-serif;
    cursor: pointer;
    ${focusRing}

    &:hover {
        background-color: ${c.accentHover};
    }
`;

export const SecondaryButton = styled.button`
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    height: 36px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 8px;
    background: transparent;
    color: ${c.textSecondary};
    font:
        500 13px Roboto,
        "Helvetica Neue",
        Arial,
        sans-serif;
    cursor: pointer;
    ${focusRing}

    &:hover {
        background-color: ${c.hover};
        color: ${c.text};
    }

    svg {
        width: 14px;
        height: 14px;
    }
`;

// ---------------------------------------------------------------- Fila de colección

const CollectionCard = styled.div<{ $emphasized: boolean }>`
    border-radius: 10px;
    border: 1px solid ${({ $emphasized }) => ($emphasized ? c.border : "transparent")};
    background-color: ${({ $emphasized }) => ($emphasized ? c.raised : "transparent")};
    margin-bottom: ${({ $emphasized }) => ($emphasized ? "6px" : "0")};
`;

const CollectionHeader = styled.div`
    display: flex;
    align-items: center;
    gap: 2px;
    height: 40px;
    padding: 0 4px;
`;

const CollectionName = styled.span<{ $hidden: boolean; $emphasized: boolean }>`
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: ${({ $emphasized }) => ($emphasized ? 500 : 400)};
    color: ${({ $hidden }) => ($hidden ? c.textDisabled : c.text)};
    text-decoration: ${({ $hidden }) => ($hidden ? "line-through" : "none")};
`;

const CountBadge = styled.span`
    flex: none;
    padding: 1px 7px;
    border-radius: 9px;
    background-color: ${c.hover};
    color: ${c.textMuted};
    font-size: 11px;
`;

const CollectionBody = styled.div`
    padding: 0 0 8px 6px;
`;

interface CollectionRowProps {
    name: string;
    count?: number;
    emphasized?: boolean;
    open: boolean;
    onToggleOpen: () => void;
    actions: ReactNode;
    hidden?: boolean;
    children?: ReactNode;
}

export const CollectionRow: FC<CollectionRowProps> = ({
    name,
    count,
    emphasized = false,
    open,
    onToggleOpen,
    actions,
    hidden = false,
    children,
}) => (
    <CollectionCard $emphasized={emphasized}>
        <CollectionHeader>
            <HeaderButton
                type="button"
                aria-expanded={open}
                onClick={onToggleOpen}
                style={{ fontWeight: 400, gap: 8 }}
                title={name}
            >
                <Chevron $open={open} aria-hidden="true" />
                <CollectionName $hidden={hidden} $emphasized={emphasized}>
                    {name}
                </CollectionName>
                {count !== undefined && <CountBadge>{count}</CountBadge>}
            </HeaderButton>
            {actions}
        </CollectionHeader>
        {open && <CollectionBody>{children}</CollectionBody>}
    </CollectionCard>
);

export const GroupLabel = styled.div`
    margin: 14px 18px 6px;
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: ${c.textMuted};
`;
