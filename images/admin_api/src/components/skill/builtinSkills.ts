// The platform's built-in skills: written by the platform, read-only.
//
// admin_api writes them to the bucket (platform_data/skills/<name>/) when
// it starts (seedBuiltinSkills), replacing what is there when the platform
// brings a new version, so they always match the platform: the
// viewer-ui-options skill documents the frontend's ViewerOptions
// (DigitalTwin3DViewer/Types/types.ts) and the way the viewer merges an
// answer's uiOpts (useChatMessages in Utils/customHooks.ts). Keep them in
// step with that code.
//
// They cannot be changed or deleted through the API; to adapt one,
// duplicate it (platform or group skill with another name) and change the
// copy. A new AiAgent node starts with viewer-ui-options chosen.

export interface IBuiltinSkill {
	name: string;
	files: Record<string, string>;
}

const VIEWER_UI_OPTIONS_SKILL_MD = `---
name: viewer-ui-options
description: "Change the digital twin's 3D viewer from the chat: show or hide objects, highlight them, change their opacity, show FEM results, deformation, mesh, node or element labels, the legend, the lights and environment, or the values of the digital twin simulator. Use it whenever the user asks to show, display, visualize, hide or highlight something."
version: "1.1"
tags: [viewer, output-format]
---

# Changing the 3D viewer (uiOpts)

The user sees the digital twin in a 3D viewer next to the chat. To change
it, answer with ONLY this JSON (no text before or after it, no code fence):

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
- Object names, FEM result names, simulator fields and the "reset view"
  values of this digital twin are in the system prompt. Never invent an
  object or result name: if one is not there, say so.

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
entry per object name, merged the same way (send only the objects and the
fields that change).

| kind | all objects | per object: key → { fields } |
|---|---|---|
| sensors | sensorsOpacity (0-1), highlightAllSensors, showAllSensorsMarker, hideAllSensors | sensorsVisibilityState → { hide, highlight, opacity, showSensorMarker } |
| assets | assetsOpacity, highlightAllAssets, hideAllAssets | assetsVisibilityState → { hide, highlight, opacity } |
| animated objects | animatedObjectsOpacity, highlightAllAnimatedObjects, hideAllAnimatedObjects | animatedObjectsVisibilityState → { hide, highlight, opacity } |
| generic objects | genericObjectsOpacity, genericObjectsShowDeepObjects, highlightAllGenericObjects, hideAllGenericObjects | genericObjectsVisibilityState → { hide, highlight, opacity, showDeepObjects } |
| FEM simulation objects | femSimulationObjectsOpacity, highlightAllFemSimulationObjects, hideAllFemSimulationObjects | femSimulationObjectsVisibilityState → { hide, highlight, opacity, showMesh, showDeformation, femSimulationResult } |

Opacity goes from 0 (invisible) to 1 (opaque). To see the FEM mesh or
labels through a solid object, lower that object's opacity (e.g. 0.4).

### Scene
| key | type | meaning |
|---|---|---|
| environment | string | "none", "sunset", "dawn" or "night" |
| ambientLight / spotLight / pointLight | boolean | lights on or off |
| ambientLightIntensity / spotLightPower / pointLightPower | number | light strength |
| showAxes | boolean | draw the axes; axesScale (number) their length |
| showShadows | boolean | shadows |

### Digital twin simulator
| key | type | meaning |
|---|---|---|
| digitalTwinSimulatorState | object of numbers | inputs of the digital twin's simulator (field names in the system prompt, e.g. { "load": 10 }) |

Sending digitalTwinSimulatorState does more than change the viewer: it sets
the simulator's inputs (shown in the viewer, e.g. a load display) and is
sent on to the digital twin's pipeline, which usually recomputes the FEM
results drawn. Always send all the fields the system prompt lists.

The viewer does not tell you its simulator values: it starts with the
digital twin's defaults, which may not be the values your answers assume.
Send digitalTwinSimulatorState:
- when the user asks to change those inputs;
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

export const BUILTIN_SKILLS: IBuiltinSkill[] = [
	{ name: "viewer-ui-options", files: { "SKILL.md": VIEWER_UI_OPTIONS_SKILL_MD } },
	{
		name: "fem-results-analysis",
		files: { "SKILL.md": FEM_RESULTS_ANALYSIS_SKILL_MD, "checklist.md": FEM_RESULTS_CHECKLIST_MD },
	},
];

export const BUILTIN_SKILL_NAMES = BUILTIN_SKILLS.map((s) => s.name);

export const isBuiltinSkill = (name: string): boolean => BUILTIN_SKILL_NAMES.includes(name);
