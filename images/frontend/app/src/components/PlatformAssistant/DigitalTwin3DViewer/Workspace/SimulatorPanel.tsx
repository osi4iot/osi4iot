// The "Simulator" panel: the digital twin's simulator (what the Sim. tab of the assistant panel and its floating
// window were). Its sliders set the values of the simulation parameters (its format, digitalTwinSimulationFormat);
// while the simulation runs the reading of the sensors is locked and the values are sent to the digital twin.
// One per slide, in its place of the grid; it can float over a panel in full screen (ViewerWorkspace). The group's
// editors and administrators write (SimulatorFormatEditor), load and download its format with the icons of its bar
// (DigitalTwin3DViewer).
import { FC } from "react";
import styled, { keyframes } from "styled-components";
import { Play, RefreshCw, RotateCcw, Square } from "lucide-react";
import { scrollbarStyle } from "../../../Tools/FormTools";
import { SliderField, focusRing, panelColors as c } from "../AssistantPanel/controls";

export interface SimulationParameter {
    minValue: number;
    maxValue: number;
    defaultValue: number;
    step: number;
    label?: string;
    units?: string;
}

// fills the panel's body (absolutely: the list of parameters scrolls, the buttons stay)
const Wrap = styled.div`
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    min-height: 0;
    color: ${c.text};
    font-family: Roboto, "Helvetica Neue", Arial, sans-serif;
`;

const pulse = keyframes`
    50% { opacity: 0.35; }
`;

const Status = styled.p<{ $live: boolean }>`
    flex: none;
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0;
    padding: 8px 14px;
    font-size: 12px;
    color: ${({ $live }) => ($live ? c.okText : c.textMuted)};
    border-bottom: 1px solid ${c.divider};

    &::before {
        content: "";
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background-color: ${({ $live }) => ($live ? c.ok : c.textDisabled)};
        animation: ${({ $live }) => ($live ? pulse : "none")} 1.4s ease-in-out infinite;
    }
`;

const Body = styled.div`
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 4px 14px 8px;
    ${scrollbarStyle}

    & > div + div {
        border-top: 1px solid ${c.divider};
    }
`;

const Empty = styled.p`
    margin: 14px 0;
    font-size: 13px;
    color: ${c.textMuted};
`;

const Footer = styled.div`
    flex: none;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    padding: 8px 10px;
    border-top: 1px solid ${c.divider};
`;

const Button = styled.button<{ $primary?: boolean; $danger?: boolean }>`
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 32px;
    padding: 0 11px;
    border-radius: 8px;
    border: 1px solid ${({ $primary }) => ($primary ? "transparent" : "rgba(255, 255, 255, 0.14)")};
    background-color: ${({ $primary }) => ($primary ? c.accentStrong : "transparent")};
    color: ${({ $primary, $danger }) => ($primary ? "#ffffff" : $danger ? "#ffb3bb" : c.textSecondary)};
    font:
        500 12px Roboto,
        "Helvetica Neue",
        Arial,
        sans-serif;
    cursor: pointer;
    ${focusRing}

    &:hover:not(:disabled) {
        background-color: ${({ $primary }) => ($primary ? c.accentHover : c.hover)};
        color: #ffffff;
    }
    &:disabled {
        opacity: 0.45;
        cursor: default;
    }
    svg {
        width: 14px;
        height: 14px;
    }
`;

const IconOnly = styled(Button)`
    width: 32px;
    padding: 0;
    justify-content: center;
`;

const Spacer = styled.span`
    flex: 1;
`;

export interface SimulatorPanelProps {
    format: Record<string, SimulationParameter>;
    // the values being simulated (or the last measurements, while it does not simulate)
    values?: Record<string, number>;
    // the simulation runs: the reading of the sensors is locked and the values are sent
    simulating: boolean;
    onChange: (values: Record<string, number>) => void;
    // start or stop the simulation (locks or unlocks the reading of the sensors)
    onToggleSimulation: () => void;
    onGetLastMeasurements: () => void;
    // the group's editors and administrators: the format is written or loaded with the icons of the panel's bar
    canEdit?: boolean;
}

export const defaultSimulatorValues = (format: Record<string, SimulationParameter>) => {
    const values: Record<string, number> = {};
    for (const name of Object.keys(format ?? {})) values[name] = Number(format[name].defaultValue);
    return values;
};

const SimulatorPanel: FC<SimulatorPanelProps> = ({
    format,
    values,
    simulating,
    onChange,
    onToggleSimulation,
    onGetLastMeasurements,
    canEdit = false,
}) => {
    const names = Object.keys(format ?? {});
    const current = (name: string) => {
        const value = Number(values?.[name]);
        return values?.[name] !== undefined && values?.[name] !== null && Number.isFinite(value)
            ? value
            : Number(format[name].defaultValue);
    };
    const all = () => Object.fromEntries(names.map((name) => [name, current(name)]));

    return (
        <Wrap data-testid="simulator-panel">
            {names.length > 0 && (
                <Status role="status" $live={simulating}>
                    {simulating ? "Sending simulated values to the digital twin" : "Showing the sensors' measurements"}
                </Status>
            )}
            <Body>
                {names.length === 0 && (
                    <Empty>
                        This digital twin has no simulator format.
                        {canEdit ? " Write its parameters with the Edit icon of this panel, or load them (.json or .yaml) with its Upload icon." : ""}
                    </Empty>
                )}
                {names.map((name) => {
                    const p = format[name];
                    return (
                        <SliderField
                            key={name}
                            id={`simulator-panel-${name.replace(/[^A-Za-z0-9_-]/g, "_")}`}
                            label={p.label ?? name}
                            unit={p.units}
                            value={current(name)}
                            min={Number(p.minValue)}
                            max={Number(p.maxValue)}
                            step={Number(p.step)}
                            inset={false}
                            stepButtons
                            showRange
                            onChange={(value) => onChange({ ...all(), [name]: value })}
                        />
                    );
                })}
            </Body>
            {names.length > 0 && (
                <Footer>
                    <Button
                        type="button"
                        $primary={!simulating}
                        $danger={simulating}
                        onClick={onToggleSimulation}
                        title={
                            simulating
                                ? "Stop sending simulated values and read the sensors again"
                                : "Lock the reading of the sensors and send these values"
                        }
                    >
                        {simulating ? <Square aria-hidden="true" /> : <Play aria-hidden="true" />}
                        {simulating ? "Stop simulation" : "Start simulation"}
                    </Button>
                    <Spacer />
                    <IconOnly
                        type="button"
                        aria-label="Reset to default values"
                        title="Reset to default values"
                        onClick={() => onChange(defaultSimulatorValues(format))}
                    >
                        <RotateCcw aria-hidden="true" />
                    </IconOnly>
                    <IconOnly
                        type="button"
                        aria-label="Get last measurements"
                        title="Get the last measurements of the sensors"
                        onClick={onGetLastMeasurements}
                    >
                        <RefreshCw aria-hidden="true" />
                    </IconOnly>
                </Footer>
            )}
        </Wrap>
    );
};

export default SimulatorPanel;
