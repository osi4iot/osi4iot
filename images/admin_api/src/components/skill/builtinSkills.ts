// The platform's built-in skills: written by the platform, read-only.
//
// admin_api writes them to the bucket (platform_data/skills/<name>/) when
// it starts (seedBuiltinSkills), replacing what is there when the platform
// brings a new version, so they always match the platform: the
// viewer-ui-options skill documents the frontend's ViewerOptions
// (DigitalTwin3DViewer/Types/types.ts) and the way the viewer merges an
// answer's uiOpts (useChatMessages in Utils/customHooks.ts). Keep them in
// step with that code.
// The frontend test AssistantPanel/viewerUiOptionsSkill.test.ts fails when an
// option of ViewerOptions is not in viewer-ui-options.
//
// They cannot be changed or deleted through the API; to adapt one,
// duplicate it (platform or group skill with another name) and change the
// copy. A new AiAgent node starts with viewer-ui-options and
// answer-format chosen. answer-format documents what the chat renders
// (DigitalTwin3DViewer/ChatAssitant/MathMessage.tsx) and the sensor-chart
// tool (pipelines' mcp_servers/sensor_history): keep it in step with them.

export interface IBuiltinSkill {
	name: string;
	files: Record<string, string>;
}

const VIEWER_UI_OPTIONS_SKILL_MD = `---
name: viewer-ui-options
description: "Change the digital twin's 3D viewer from the chat: show or hide objects, highlight them, change their opacity, show or hide the sensor markers, show FEM results, deformation, mesh, node or element labels, the legend, the lights and environment, or the values of the digital twin simulator. Use it whenever the user asks to show, display, visualize, hide, mark, locate, point out or highlight something, and whenever they ask where something is ('where are the sensors?', '¿dónde están los sensores?', 'márcalos'): the viewer shows it."
version: "1.11"
tags: [viewer, output-format]
---

# Changing the 3D viewer (uiOpts)

The user sees the digital twin in a 3D viewer next to the chat: a 3D
model of the asset with its sensors, assets and objects in their real
places. You control that viewer. When the user asks where something is,
or to show, mark or point it out, change the viewer: never answer that
you have no drawing, plan, coordinates or positions, and never ask the
user for an image. The 3D model already has them.

## Quick answers

| The user says | Answer with |
|---|---|
| "where are the sensors?", "¿dónde están los sensores?", "mark / show / point out the sensors", "márcalos", "muéstrame los marcadores" | {"message": "...", "uiOpts": {"showAllSensorsMarker": true}} |
| "where are the strain gauges?" (the sensors of one collection) | {"message": "...", "uiOpts": {"sensorsVisibilityState": {"<collection>": {"showSensorMarker": true}}}} |
| "hide the markers", "quita los marcadores" | {"message": "...", "uiOpts": {"showAllSensorsMarker": false}} (and showSensorMarker: false for the collections shown one by one) |
| "only the sensors I can see", "hide the markers behind the tower" | {"message": "...", "uiOpts": {"showOccludedSensorMarkers": false}} |
| "make the sensors blink", "highlight the sensors" | {"message": "...", "uiOpts": {"highlightAllSensors": true}} |
| "show the displacements in x", "muéstrame las tensiones", a FEM result name | {"message": "...", "uiOpts": {"femSimulationResult": "<FEM result, e.g. Disp_X>"}} |
| "show the deformed shape (x100)" | {"message": "...", "uiOpts": {"showFemSimulationDeformation": true, "femSimulationDefScale": 2}} |
| "raise the wind of the simulator to 25 m/s", "simula 10 kN" | {"message": "...", "uiOpts": {"digitalTwinSimulatorState": {"<field>": 25}}} |

FEM results (displacements, stresses, strains of the finite element model)
are drawn on the 3D model: they are not sensor data. When the user asks for
a displacement, stress or strain "in x" or the like, look for the FEM
result in the "[Viewer: ...]" note (FEM results), in the system prompt or
with fem_results__results-list, and show it: "displacement in x" is
usually Disp_X. Never answer that no sensor measures it.

### Views of the system prompt

The system prompt may define views: sets of uiOpts that make something
easy to see in this model, e.g. a "FEM results view" that lowers the
opacity of the objects in front of the FEM mesh, and a "normal view" that
restores them. Merge the keys of the view that applies into the uiOpts of
your answer (one JSON: the view's keys and the ones the user asked for),
every time it applies, unless the user asked for other values.

In the message, say what the user now sees: for the markers, that each
one is on its sensor, green when its data are live, and that hovering it
shows its name and current value. If you know which sensors there are
(the system prompt or list-sensors), you can name them.

## The answer

To change the viewer, answer with ONLY this JSON (no text before or after
it, no code fence):

{"message": "<what you did, in the user's language>", "uiOpts": { ... }}

Answer in plain text (no JSON) when nothing in the viewer has to change:
questions about values, counts, documents, explanations.

## How the viewer applies uiOpts

- uiOpts is MERGED into the viewer's current state, key by key and into
  nested objects. Send ONLY the keys that must change: what you leave out
  stays as it is, including what the user changed by hand in the viewer.
  Do not send a full template every time: it would undo the user's changes.
- Because the state persists, "show the stresses" after "show Disp_Z"
  only needs femSimulationResult; deformation, scale and labels stay.
- Arrays are replaced whole: femNodeLabels: [5, 7] shows labels 5 and 7
  only. To remove all labels send an empty array: femNodeLabels: [].
- Numbers as numbers, booleans as booleans, arrays as arrays: never as
  strings.
- Names: each question from the web chat comes with a note
  "[Viewer: ...]" listing what the viewer holds, by their exact names:
  the sensor, asset, generic and FEM object collections, the animated
  objects and the FEM results. The per-collection maps and
  femSimulationResult take those names EXACTLY as written there, with
  their capitals and spaces ("Sea", not "sea"). Match the user's words to
  them ignoring capitals, accents and small differences ("el mar" may be
  "Sea"); if several could match, or none does, ask or say which there
  are. Never invent a name. The system prompt may give more (simulator
  fields, the "reset view" values).

## Keys

### FEM results
| key | type | meaning |
|---|---|---|
| femSimulationResult | string | result drawn on the mesh (a name from the system prompt or fem_results__results-list); "None result" draws none |
| showFemSimulationDeformation | boolean | draw the deformed shape |
| femSimulationDefScale | number | deformation scale as a POWER OF TEN: the factor is 10^value (0 → x1, 1 → x10, 2 → x100, 1.9 → x79). Range -2 to 10 |
| showAllFemSimulationMeshes | boolean | draw the mesh edges (needed to read node or element labels) |
| femNodeLabels | number[] | node numbers whose labels are shown |
| femElemLabels | number[] | element numbers whose labels are shown |
| legendToShow | string | result whose legend is shown when femSimulationResult is "None result" |
| hideFemSimulationLegend | boolean | hide the colour legend |
| femResultDate | string | which uploaded set of FEM results (by date) is shown; leave it out unless the user asks for another date |

### Objects
For each kind of object there are keys for all of them and a map with one
entry per collection (the group of objects the assistant panel lists, by its
name in the system prompt), merged the same way (send only the
collections and the fields that change).

| kind | all objects | per object: key → { fields } |
|---|---|---|
| sensors | sensorsOpacity (0-1), highlightAllSensors, showAllSensorsMarker, hideAllSensors | sensorsVisibilityState → { hide, highlight, opacity, showSensorMarker } |
| assets | assetsOpacity, highlightAllAssets, hideAllAssets | assetsVisibilityState → { hide, highlight, opacity } |
| animated objects | animatedObjectsOpacity, highlightAllAnimatedObjects, hideAllAnimatedObjects | animatedObjectsVisibilityState → { hide, highlight, opacity } |
| generic objects | genericObjectsOpacity, genericObjectsShowDeepObjects, highlightAllGenericObjects, hideAllGenericObjects | genericObjectsVisibilityState → { hide, highlight, opacity, showDeepObjects } |
| FEM simulation objects | femSimulationObjectsOpacity, highlightAllFemSimulationObjects, hideAllFemSimulationObjects | femSimulationObjectsVisibilityState → { hide, highlight, opacity, showMesh, showDeformation, femSimulationResult } |

Opacity goes from 0 (invisible) to 1 (opaque). To see the FEM mesh or
labels through a solid object, lower that object's opacity (e.g. 0.4).

### Sensor markers
A marker is a small glowing pin over each sensor of the 3D model: green
when its data are live, amber when no new data arrived for a while, grey
when it has none. Hovering it shows the sensor's name and its current
value with units; clicking it opens the sensor's dashboard.

- All the sensors: showAllSensorsMarker (true to show, false to hide).
- The sensors of one collection: sensorsVisibilityState → { "<collection>":
  { showSensorMarker: true } }.

- Markers behind other objects: showOccludedSensorMarkers (true, the
  default: all markers are drawn, also those of sensors hidden behind
  other objects; false: only the markers of the sensors the camera sees).
  Use false when the user wants to see only the sensors in view or finds
  too many markers; true when they want to see all of them.

Show them when the user asks to see, mark, locate or point out the
sensors ("where are the sensors?", "show the sensor markers"). To hide
them all, send showAllSensorsMarker: false and, for each collection whose
markers were shown one by one, showSensorMarker: false. The markers do
not change which sensors are visible: hideAllSensors / hide do that.

### Scene
| key | type | meaning |
|---|---|---|
| environment | string | "none", "sunset", "dawn" or "night" |
| ambientLight / spotLight / pointLight | boolean | lights on or off |
| ambientLightIntensity / spotLightPower / pointLightPower | number | light strength (ambient 0-10; spot and point lights 0-5000, in lumens) |
| showSpotLightHelper / showPointLightHelper | boolean | draw where the spot / point light is and where it points (only with that light on) |
| showAxes | boolean | draw the axes; axesScale (number) their length |
| showShadows | boolean | shadows |

### Performance (only when the user asks)
| key | type | meaning |
|---|---|---|
| enableWebWorkes | boolean | compute the FEM results in background threads (web workers), so the viewer stays fluid; the key is spelled this way |
| numWebWorkers | number | how many of those threads (1 to the processor's cores) |
| logElapsedTime | boolean | write in the browser console how long each FEM computation takes |

Do not change these to show or hide anything: they only change how fast
the viewer computes the FEM results.

### Digital twin simulator
| key | type | meaning |
|---|---|---|
| digitalTwinSimulatorState | object of numbers | inputs of the digital twin's simulator, by field name, e.g. { "windSpeed": 25 } |

The fields, with their label, units, range and current value, are in the
"[Viewer: ...]" note (simulator inputs) and may be in the system prompt.
Use the field name, not its label ("windSpeed", not "Wind speed"), and a
value within its range. Send only the fields that change: the others keep
their value.

Sending digitalTwinSimulatorState does more than change the viewer: the
viewer stops reading the live measurements (as the user's "Lock read
measurements" button in the Sim tab does), shows the simulated inputs and
sends them to the digital twin's pipeline, which usually recomputes what
the model shows (FEM results, animations). Say so in the message: the
viewer is now simulating, and to go back to the live measurements the
user presses "Unlock read measurements" in the Sim tab of the assistant panel.

Send it:
- when the user asks to change those inputs ("raise the wind to 25 m/s",
  "simulate a load of 10 kN");
- when the system prompt says to include it (e.g. in every answer that
  shows FEM results, with the current values), so that what the viewer
  draws, the values it displays and your calculations are the same.

## Combining with tools

When the answer needs data first (the node with the maximum value, an
element number, a result name), call the tools first and then answer with
the JSON that shows it.

## Examples

Show the label of node 100 (the mesh is needed to see labels):
{"message": "Mostrando la etiqueta del nodo 100", "uiOpts": {"showAllFemSimulationMeshes": true, "femNodeLabels": [100]}}

Show the stresses on the top fibre, with deformation x100:
{"message": "Showing Sx_top with the deformed shape (x100)", "uiOpts": {"femSimulationResult": "Sx_top", "showFemSimulationDeformation": true, "femSimulationDefScale": 2}}

Remove the labels:
{"message": "Labels removed", "uiOpts": {"femNodeLabels": [], "femElemLabels": []}}

Show the markers of all the sensors:
{"message": "Marcadores de los sensores activados: pasa el ratón por encima para ver cada valor", "uiOpts": {"showAllSensorsMarker": true}}

Show only the markers of the sensors in view (not those behind other objects):
{"message": "Only the markers of the visible sensors are shown now", "uiOpts": {"showAllSensorsMarker": true, "showOccludedSensorMarkers": false}}

Show only the markers of the collection "Strain gauges":
{"message": "Showing the strain gauge markers", "uiOpts": {"sensorsVisibilityState": {"Strain gauges": {"showSensorMarker": true}}}}

Make the object "Frame" transparent and hide all sensors:
{"message": "Frame at 40 % opacity, sensors hidden", "uiOpts": {"genericObjectsVisibilityState": {"Frame": {"opacity": 0.4}}, "hideAllSensors": true}}

Reset the view: send the "reset view" values the system prompt gives, and
empty label arrays.
`;

const FEM_RESULTS_ANALYSIS_SKILL_MD = `---
name: fem-results-analysis
description: "Analyse the digital twin's finite element (FEM) results: maximum, minimum or critical values, values at a node or element, and checks against an allowable value."
version: "1.2"
tags: [fem, simulation]
requires_mcp: [fem_results, calculate_expression1]
---

# FEM results analysis

Use the fem_results__* tools, always in this order:

1. Call fem_results__results-list first. Use the result names exactly as
   it returns them; never guess a name.
2. Every value tool takes params: the combination factor of each load
   case (one number per load case, in order). The value returned is
   sum(factor_i * result_i).
   - How a load the user gives becomes a factor depends on the load the
     model was computed with: the system prompt of this digital twin says
     it (for example "factor = load / 10"). Use that rule.
   - If the system prompt does not say it and the user's load
     combination is not clear, ask before computing.
3. Pick the tool:
   - Peak of one result: max-value and min-value (report both when the
     sign matters, e.g. stresses in tension and compression).
   - Worst case over several results: critical-value (it adds the
     absolute values of the results in result_names).
   - A given location: nodal-value (node_id) or elem-value (element_id).
   - Mesh size: num-nodes, num-elements.
4. Any arithmetic (ratios, unit conversions, safety factors): use
   calculate_expression1__calculate_expression; never compute by hand.

## Answer

Write for the user, who does not see the tools:
- Give the value with its unit (if known) and, for maximum and minimum,
  where it occurs (node or element). Name the result the way the user
  did, or by what it means ("vertical displacement"), not only by its
  internal name.
- Never mention params, load factors, tool or skill names, or how you got
  the value. Mention the load only when the user asked about a given load
  or the value depends on one the user has not seen yet.
- When a limit is involved, give the utilisation ratio
  (value / allowable) and whether it passes.
- To show where a value occurs in the viewer, use the viewer-ui-options
  skill (node or element labels).
- Before saying a component is safe, go through checklist.md (read it
  with read_skill_resource).
`;

const FEM_RESULTS_CHECKLIST_MD = `# Checklist before saying a component is safe

- [ ] Result names taken from results-list, not guessed.
- [ ] Load factors (params) from the rule in the system prompt, or confirmed with the user.
- [ ] Both maximum and minimum checked for signed results.
- [ ] Allowable value given by the user or taken from a cited document, never from memory.
- [ ] Utilisation ratio computed with the calculator tool.
- [ ] Say that the result depends on the model and the loads it was computed with.
`;

const ANSWER_FORMAT_SKILL_MD = `---
name: answer-format
description: "How to present answers in the chat: tables (also of sensor readings), matrices, equations and formulas (LaTeX), code or literal text, and charts of sensor data (evolution, thresholds, spectrum, histogram, box plot, correlation, comparison bars, heat map). Use it whenever an answer has a list or table of values, several values to compare, a matrix, an equation, a formula or a result with units, or when the user asks to see, plot or chart sensor data."
version: "1.3"
tags: [output-format, chat]
---

# Presenting answers in the chat

The chat shows your text as Markdown with LaTeX formulas, in a panel about
500 pixels wide. When you answer with JSON (\`{"message": ..., "uiOpts":
...}\`, see viewer-ui-options), all of this applies to the text of
"message".

What the chat shows:

- **bold**, *italics*, \`code\`, headings (\`##\`), lists (\`-\` or \`1.\`),
  tables, code blocks (\`\`\`) and LaTeX.
- Not shown: HTML (it appears as text), Markdown images and links
  (\`[text](url)\`: write the address as it is), horizontal rules.

Keep the answer short: lead with the result, then only the detail that
helps.

The examples below are between \`\`\` lines only to mark them as
examples: write what is inside, without those lines (except in the
section on code).

## Tables

Use a table for several items with the same attributes (values of several
sensors, results per node, a comparison). One or two values go in a
sentence.

- Header row, separator row, one row per item. Align numbers to the
  right with \`---:\`.
- Units in the header, not in every cell: \`| Node | Sx (MPa) |\`.
- The same number of decimals in a column; no more than are meaningful
  (3 or 4 significant digits as a rule).
- Times in the user's time zone, said once (above the table or in the
  header): \`| Time (Europe/Madrid) | ... |\`. The question tells you the
  user's zone and the data tools already return their times in it: copy
  them, do not convert them. When there are several values per second,
  show the milliseconds (\`10:39:05.500\`), so that no two rows look the
  same.
- At most about 8 columns and 25 rows. If the user asks for all the
  values, up to about 100 rows; for more, aggregate (per minute, per
  hour), show the extremes and give a summary, or draw a chart when the
  data are a sensor's history.
- Values, readings and lists of numbers always go in a Markdown table,
  never in a code block or as aligned plain text.

Several fields of a sensor over time (the components Ax, Ay, Az of an
acceleration, the phases of a current…): call
sensor_history__sensor-history ONCE with all of them in \`fields\`. You get
one table, a row per message and a column per field, with the exact time
of each message: the fields of a message always share its time. Write
it as one table with a column per field; never split it into a list per
field.

\`\`\`
| Time (UTC+01:00) | Az (m/s²) |
|---|---:|
| 09:04:17 | 4.099 |
| 09:04:18 | 3.654 |
\`\`\`

## Equations and formulas

Write mathematics in LaTeX, never as plain text with ^ and *, or as
Unicode drawings:

- Inline, inside a sentence: \`$\\sigma = F/A$\`.
- Displayed, on its own: a block with \`$$\` on its own lines, or a
  \`\`\`latex block.

\`\`\`
$$
\\sigma_{max} = \\frac{M\\,c}{I} = 12.4\\,\\mathrm{MPa}
$$
\`\`\`

- Units in roman type with a thin space: \`12.4\\,\\mathrm{MPa}\`,
  \`4.5\\,\\mathrm{m/s^2}\`.
- Show the formula, then the values, then the result, when the user asks
  how a result was obtained; otherwise only the result.
- For a result computed with the calculator, give the result with its
  units; the expression only if it helps.

## Matrices and vectors

Always in LaTeX, displayed, with \`bmatrix\` (never drawn with characters
like ⎡ ⎤, nor inside a code block):

\`\`\`
$$
K = \\begin{bmatrix} 100 & 2 & 3 \\\\ 2 & 90 & 1 \\\\ 3 & 1 & 80 \\end{bmatrix}
$$
\`\`\`

- A vector as a column: \`\\begin{bmatrix} 1 \\\\ 0 \\\\ 0 \\end{bmatrix}\`.
- For a matrix larger than 8×8, do not write it out: give its size and
  what matters (diagonal, extreme values, symmetry, condition number).

## Code and literal text

Code, commands, JSON or anything that must be read character by
character go in a code block (\`\`\` with the language: \`\`\`json,
\`\`\`python). Never put formulas or tables in a code block: they would be
shown as text.

## Charts of sensor data

The sensor_history tools draw charts of the sensors' data. The platform
draws each one and shows it below your text; you get only its id and a
summary of the values (never the data one by one) to comment on.

Choose the chart by the question (the tools are named
sensor_history__<tool>):

| The user wants | Tool | Options |
|---|---|---|
| how values evolved, a trend | sensor-chart | fields; interval |
| the level of a vibration over time | sensor-chart | statistic rms |
| whether a limit was crossed, how often | sensor-chart | thresholds (value, label) |
| natural frequencies, vibration, rotation | sensor-spectrum | freq_min, freq_max, resolution |
| how values are distributed, the usual range | sensor-distribution | kind histogram |
| how the spread changes by hour, day, week | sensor-distribution | kind boxplot, period |
| whether one variable depends on another | sensor-correlation | field, y_field, y_sensor |
| a value per day, hour or week (daily max…) | sensor-comparison | kind periods, statistic, period |
| the same value in several sensors or assets | sensor-comparison | kind sensors, field, sensors |
| daily or weekly patterns over weeks | sensor-heatmap | layout weekday or day |

Draw a chart when the user asks to see, plot, chart or graph data, or
when the answer would need more than about 25 values over time.

How:

1. Call sensor_history__list-sensors first if you do not know the sensor
   and the names of its fields.
2. One chart per question; several fields of the same sensor (Ax, Ay,
   Az) in one time chart or spectrum. At most 4 charts per answer.
3. Title in the user's language, with what and when: "Aceleración Az –
   últimos 5 minutos".
4. Time range as the user asked (from, to), in their time zone: "now/d"
   is their midnight, a date without offset their time. The platform
   gives the tools the user's time zone: pass timezone only when the user
   asks for another one.
5. Interval: leave auto. A short range with few values is drawn value by
   value; a long one as the average per interval (the line) with the
   minimum-maximum of each interval (the band, which keeps the peaks the
   average hides). For a vibration, statistic rms gives its level. If the
   user asks what the band is, explain this.
6. Thresholds: the limits the user gives, or those of the asset's state
   (asset_state) when they are there; from the least to the most severe.
7. Spectrum: it reaches half the sampling rate the tool reports. If the
   user asks for higher frequencies, say the sensor does not sample fast
   enough. A finer resolution needs a longer range. The damping ratio
   from the bandwidth is an estimate: say so.
8. Correlation: say how strong it is from R² (e.g. above 0.9, strong),
   and that correlation is not causation when it matters.

After the chart, in the text:

- Comment in one to three sentences what it shows, with the numbers of
  the summary: range of values, extremes and when, trend, peaks,
  crossings of the limits, anything unusual.
- Do not repeat its values in a table unless the user asks for them, do
  not add a link, and do not say how to open it: it is already in the
  chat.
- If the tool says there are no values, or that the request does not fit
  (too few data, a band above the sampling rate, a query too long for a
  fast sensor), explain it and suggest what would work.

Charts are only for sensor data. For other data (FEM results, computed
values), use a table.
`;

export const BUILTIN_SKILLS: IBuiltinSkill[] = [
	{ name: "viewer-ui-options", files: { "SKILL.md": VIEWER_UI_OPTIONS_SKILL_MD } },
	{
		name: "fem-results-analysis",
		files: { "SKILL.md": FEM_RESULTS_ANALYSIS_SKILL_MD, "checklist.md": FEM_RESULTS_CHECKLIST_MD },
	},
	{ name: "answer-format", files: { "SKILL.md": ANSWER_FORMAT_SKILL_MD } },
];

export const BUILTIN_SKILL_NAMES = BUILTIN_SKILLS.map((s) => s.name);

export const isBuiltinSkill = (name: string): boolean => BUILTIN_SKILL_NAMES.includes(name);
