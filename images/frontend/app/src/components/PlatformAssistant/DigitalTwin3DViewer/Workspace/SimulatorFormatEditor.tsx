// The simulator format, written by hand in the Simulator panel (its Edit icon, for the group's editors and
// administrators): the parameters of the simulation, one by one, besides loading them all from a .json / .yaml.
// Saved like a loaded file (digital_twin_simulator_format), with the same rules as admin_api: names of letters,
// digits, "_", "." and "-" (up to 80), at most MAX_SIMULATOR_PARAMETERS, each with label, units, minValue,
// maxValue, defaultValue and step (digitalTwinFormatValidation).
import { FC, useState } from "react";
import styled from "styled-components";
import { Plus, Save, Trash2, X } from "lucide-react";
import { scrollbarStyle } from "../../../Tools/FormTools";
import { focusRing, panelColors as c } from "../AssistantPanel/controls";
import type { SimulationParameter } from "./SimulatorPanel";

export const MAX_SIMULATOR_PARAMETERS = 200;
const NAME_RE = /^[A-Za-z0-9_.-]{1,80}$/;

// a parameter being edited: the numbers as typed (a field may be empty or "-" while it is written)
export interface ParameterRow {
  key: number;
  name: string;
  label: string;
  units: string;
  minValue: string;
  maxValue: string;
  defaultValue: string;
  step: string;
}

let nextKey = 1;
const rowKey = () => nextKey++;

export const rowsOf = (
  format: Record<string, SimulationParameter>,
): ParameterRow[] =>
  Object.entries(format ?? {}).map(([name, p]) => ({
    key: rowKey(),
    name,
    label: p.label ?? name,
    units: p.units ?? "",
    minValue: String(p.minValue),
    maxValue: String(p.maxValue),
    defaultValue: String(p.defaultValue),
    step: String(p.step),
  }));

// a new parameter: a name not used yet, from 0 to 1 by 0.1
export const newRow = (rows: ParameterRow[]): ParameterRow => {
  const used = new Set(rows.map((r) => r.name));
  let i = rows.length + 1;
  while (used.has(`param_${i}`)) i++;
  return {
    key: rowKey(),
    name: `param_${i}`,
    label: `Parameter ${i}`,
    units: "",
    minValue: "0",
    maxValue: "1",
    defaultValue: "0",
    step: "0.1",
  };
};

const num = (text: string) => (text.trim() === "" ? NaN : Number(text));

// what is wrong with each parameter (by its key; none: it can be saved), and with the whole format
export const formatProblems = (
  rows: ParameterRow[],
): { rows: Record<number, string>; format?: string } => {
  const problems: Record<number, string> = {};
  const seen = new Map<string, number>();
  for (const r of rows) {
    const name = r.name.trim();
    const [min, max, def, step] = [
      num(r.minValue),
      num(r.maxValue),
      num(r.defaultValue),
      num(r.step),
    ];
    let problem: string | undefined;
    if (!NAME_RE.test(name))
      problem =
        'The name takes letters, digits, "_", "." and "-" (up to 80), without spaces';
    else if (seen.has(name))
      problem = `"${name}" is already the name of another parameter`;
    else if (r.label.trim() === "") problem = "The label is missing";
    else if (![min, max, def, step].every(Number.isFinite))
      problem = "Minimum, maximum, default and step must be numbers";
    else if (min >= max) problem = "The minimum must be lower than the maximum";
    else if (def < min || def > max)
      problem = "The default value must be between the minimum and the maximum";
    else if (step <= 0) problem = "The step must be greater than 0";
    else if (step > max - min)
      problem =
        "The step must not be greater than the range (maximum − minimum)";
    if (problem) problems[r.key] = problem;
    seen.set(name, r.key);
  }
  const format =
    rows.length > MAX_SIMULATOR_PARAMETERS
      ? `At most ${MAX_SIMULATOR_PARAMETERS} parameters`
      : undefined;
  return { rows: problems, format };
};

// the format to save (only when formatProblems finds nothing)
export const formatOf = (
  rows: ParameterRow[],
): Record<string, Required<SimulationParameter>> =>
  Object.fromEntries(
    rows.map((r) => [
      r.name.trim(),
      {
        label: r.label.trim(),
        units: r.units.trim(),
        minValue: Number(r.minValue),
        maxValue: Number(r.maxValue),
        defaultValue: Number(r.defaultValue),
        step: Number(r.step),
      },
    ]),
  );

const Wrap = styled.div`
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
  color: ${c.text};
  font-family: Roboto, "Helvetica Neue", Arial, sans-serif;
`;

const Body = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  ${scrollbarStyle}
`;

const Card = styled.fieldset<{ $wrong: boolean }>`
  margin: 0;
  padding: 8px 10px 10px;
  border-radius: 8px;
  border: 1px solid
    ${({ $wrong }) => ($wrong ? "rgba(255, 107, 107, 0.6)" : c.border)};
  background-color: ${c.raised};
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
  gap: 8px;
`;

const CardHead = styled.div`
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: ${c.textMuted};
`;

const Field = styled.label`
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
  font-size: 11px;
  color: ${c.textMuted};

  input {
    height: 28px;
    min-width: 0;
    padding: 0 8px;
    border-radius: 6px;
    border: 1px solid ${c.border};
    background-color: ${c.field};
    color: ${c.text};
    font:
      13px Roboto,
      "Helvetica Neue",
      Arial,
      sans-serif;
    ${focusRing}
  }
`;

const Problem = styled.p`
  grid-column: 1 / -1;
  margin: 0;
  font-size: 12px;
  color: ${c.danger};
`;

const Empty = styled.p`
  margin: 4px 0;
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

const Button = styled.button<{ $primary?: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 11px;
  border-radius: 8px;
  border: 1px solid
    ${({ $primary }) => ($primary ? "transparent" : "rgba(255, 255, 255, 0.14)")};
  background-color: ${({ $primary }) => ($primary ? c.accentStrong : "transparent")};
  color: ${({ $primary }) => ($primary ? "#ffffff" : c.textSecondary)};
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

const IconButton = styled(Button)`
  width: 26px;
  height: 26px;
  padding: 0;
  justify-content: center;
  border-color: transparent;
`;

const Spacer = styled.span`
  flex: 1;
`;

export interface SimulatorFormatEditorProps {
  format: Record<string, SimulationParameter>;
  // saves the format: true when it was saved (then the editor closes)
  onSave: (
    format: Record<string, Required<SimulationParameter>>,
  ) => Promise<boolean>;
  onCancel: () => void;
}

const SimulatorFormatEditor: FC<SimulatorFormatEditorProps> = ({
  format,
  onSave,
  onCancel,
}) => {
  const [rows, setRows] = useState<ParameterRow[]>(() => rowsOf(format));
  const [saving, setSaving] = useState(false);
  // the problems are shown once Save was tried (not while the first parameter is being written)
  const [tried, setTried] = useState(false);
  const problems = formatProblems(rows);
  const wrong = Object.keys(problems.rows).length > 0 || !!problems.format;

  const set = (
    key: number,
    field: keyof Omit<ParameterRow, "key">,
    value: string,
  ) =>
    setRows((current) =>
      current.map((r) => (r.key === key ? { ...r, [field]: value } : r)),
    );
  const add = () => setRows((current) => [...current, newRow(current)]);
  const remove = (key: number) =>
    setRows((current) => current.filter((r) => r.key !== key));
  const save = async () => {
    setTried(true);
    if (wrong) return;
    setSaving(true);
    try {
      await onSave(formatOf(rows));
    } finally {
      setSaving(false);
    }
  };

  const field = (
    r: ParameterRow,
    name: keyof Omit<ParameterRow, "key">,
    label: string,
    numeric = false,
  ) => (
    <Field>
      {label}
      <input
        value={r[name]}
        inputMode={numeric ? "decimal" : undefined}
        aria-label={`${label} of ${r.name || "the parameter"}`}
        onChange={(e) => set(r.key, name, e.target.value)}
      />
    </Field>
  );

  return (
    <Wrap data-testid="simulator-format-editor">
      <Body>
        {rows.length === 0 && <Empty>No parameters. Add the first one.</Empty>}
        {rows.map((r, i) => (
          <Card
            key={r.key}
            $wrong={tried && !!problems.rows[r.key]}
            aria-label={`Parameter ${i + 1}`}
          >
            <CardHead>
              <span>Parameter {i + 1}</span>
              <IconButton
                type="button"
                aria-label={`Remove ${r.name || `parameter ${i + 1}`}`}
                title="Remove this parameter"
                onClick={() => remove(r.key)}
              >
                <Trash2 aria-hidden="true" />
              </IconButton>
            </CardHead>
            {field(r, "name", "Name")}
            {field(r, "label", "Label")}
            {field(r, "units", "Units")}
            {field(r, "minValue", "Minimum", true)}
            {field(r, "maxValue", "Maximum", true)}
            {field(r, "defaultValue", "Default", true)}
            {field(r, "step", "Step", true)}
            {tried && problems.rows[r.key] && (
              <Problem role="alert">{problems.rows[r.key]}</Problem>
            )}
          </Card>
        ))}
        {tried && problems.format && (
          <Problem role="alert">{problems.format}</Problem>
        )}
      </Body>
      <Footer>
        <Button
          type="button"
          onClick={add}
          disabled={rows.length >= MAX_SIMULATOR_PARAMETERS}
        >
          <Plus aria-hidden="true" />
          Add parameter
        </Button>
        <Spacer />
        <Button type="button" onClick={onCancel} disabled={saving}>
          <X aria-hidden="true" />
          Cancel
        </Button>
        <Button
          type="button"
          $primary
          onClick={save}
          disabled={saving || (tried && wrong)}
        >
          <Save aria-hidden="true" />
          {saving ? "Saving…" : "Save format"}
        </Button>
      </Footer>
    </Wrap>
  );
};

export default SimulatorFormatEditor;
