// Inspector acoplado del visor 3D: sustituye al panel de react-dat-gui con pestañas por categoría.
import { FC, ReactNode, useEffect, useMemo, useState } from "react";
import styled from "styled-components";
import {
    Cpu,
    Eye,
    EyeOff,
    Grid3x3,
    Layers,
    Lightbulb,
    Lock,
    LockOpen,
    MapPin,
    Radio,
    RotateCcw,
    Search,
    SlidersHorizontal,
    Sun,
    Wrench,
} from "lucide-react";

import { ViewerOptions } from "../Types/types";
import { DEFAULT_VIEWER_OPTIONS, ENVIRONMENT_OPTIONS } from "../Utils/constants";
import { clonePlain, withOptionAt } from "./optionsUpdate";
import {
    CollectionRow,
    GroupLabel,
    IconToggle,
    PrimaryButton,
    SecondaryButton,
    Section,
    SelectField,
    SliderField,
    SwitchRow,
    focusRing,
    inspectorColors as c,
} from "./controls";

export const INSPECTOR_WIDTH = 360;
export const INSPECTOR_GAP = 12;

type TabId = "scene" | "sensors" | "assets" | "objects" | "fem" | "simulator" | "system";

// Estado de la interfaz (pestaña, secciones y colecciones abiertas): se conserva al cerrar y volver a abrir
const uiMemory: { tab: TabId; open: Record<string, boolean> } = {
    tab: "scene",
    open: { environment: true, ambient: true, spot: false, point: false, femResults: true, workers: true, simulator: true },
};

const Panel = styled.aside`
    position: absolute;
    top: ${INSPECTOR_GAP}px;
    right: ${INSPECTOR_GAP}px;
    bottom: ${INSPECTOR_GAP}px;
    width: ${INSPECTOR_WIDTH}px;
    max-width: calc(100% - ${2 * INSPECTOR_GAP}px);
    display: flex;
    flex-direction: column;
    background-color: ${c.surface};
    backdrop-filter: blur(8px);
    border: 1px solid ${c.border};
    border-radius: 14px;
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.45);
    color: ${c.text};
    font-family: Roboto, "Helvetica Neue", Arial, sans-serif;
    overflow: hidden;
    z-index: 1000;
    user-select: none;

    input,
    select {
        user-select: text;
    }
`;

const TabList = styled.div<{ $count: number }>`
    display: grid;
    grid-template-columns: repeat(${({ $count }) => $count}, minmax(0, 1fr));
    gap: 2px;
    padding: 6px;
    border-bottom: 1px solid ${c.divider};
`;

const Tab = styled.button<{ $selected: boolean }>`
    height: 52px;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 0 2px;
    border: 0;
    border-radius: 8px;
    background-color: ${({ $selected }) => ($selected ? c.selected : "transparent")};
    box-shadow: ${({ $selected }) => ($selected ? `inset 0 -2px 0 ${c.accent}` : "none")};
    color: ${({ $selected }) => ($selected ? "#ffffff" : c.textMuted)};
    font: 500 11px Roboto, "Helvetica Neue", Arial, sans-serif;
    cursor: pointer;
    ${focusRing}

    &:hover {
        color: ${c.text};
        background-color: ${({ $selected }) => ($selected ? c.selected : c.hover)};
    }

    svg {
        width: 18px;
        height: 18px;
        flex: none;
    }

    span {
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
`;

const Body = styled.div`
    flex: 1;
    overflow-y: auto;
    padding: 8px 0 16px;

    &::-webkit-scrollbar {
        width: 8px;
    }
    &::-webkit-scrollbar-thumb {
        background: ${c.track};
        border-radius: 4px;
    }
`;

const Footer = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    height: 48px;
    padding: 0 16px;
    border-top: 1px solid ${c.divider};
    font-size: 12px;
    color: ${c.textMuted};
`;

const SmallButton = styled.button`
    display: flex;
    align-items: center;
    gap: 6px;
    height: 30px;
    padding: 0 10px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 7px;
    background: transparent;
    color: ${c.textSecondary};
    font: 500 12px Roboto, "Helvetica Neue", Arial, sans-serif;
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

const FilterBox = styled.label`
    display: flex;
    align-items: center;
    gap: 8px;
    height: 36px;
    margin: 4px 12px 0;
    padding: 0 10px;
    border-radius: 8px;
    border: 1px solid ${c.border};
    background-color: ${c.field};

    &:focus-within {
        border-color: ${c.accent};
    }

    svg {
        width: 14px;
        height: 14px;
        color: ${c.textMuted};
        flex: none;
    }

    input {
        flex: 1;
        min-width: 0;
        border: 0;
        outline: none;
        background: transparent;
        color: ${c.text};
        font: 13px Roboto, "Helvetica Neue", Arial, sans-serif;
    }
`;

const CollectionList = styled.div`
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 0 12px;
`;

const ButtonStack = styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 6px 4px 28px;
`;

const EmptyText = styled.p`
    margin: 8px 18px;
    font-size: 12px;
    color: ${c.textMuted};
`;

interface InspectorProps {
    opts: ViewerOptions;
    setOpts: (updater: (prevOpts: ViewerOptions) => ViewerOptions) => void;
    sensorObjects: any[];
    sensorCollectionNames: string[];
    assetObjects: any[];
    assetCollectionNames: string[];
    genericObjects: any[];
    genericObjectCollectionNames: string[];
    femSimulationObjects: any[];
    femSimObjectCollectionNames: string[];
    femResultDates: string[];
    femResultNames: string[];
    digitalTwinSimulationFormat: Record<string, any>;
    getLastMeasurementsButtomLabel: string;
    lockReadingButtomLabel: string;
    handleGetLastMeasurementsButton: () => void;
    handleLockReadMeasurementsButtonClick: () => void;
}

type CollectionKind = "sensors" | "assets" | "objects" | "fem";

// Claves de ViewerOptions para "todas las colecciones" y para cada colección
const COLLECTION_KEYS: Record<
    CollectionKind,
    { opacity: string; highlight: string; hide: string; marker?: string; deep?: string; perCollection: string }
> = {
    sensors: {
        opacity: "sensorsOpacity",
        highlight: "highlightAllSensors",
        hide: "hideAllSensors",
        marker: "showAllSensorsMarker",
        perCollection: "sensorsVisibilityState",
    },
    assets: { opacity: "assetsOpacity", highlight: "highlightAllAssets", hide: "hideAllAssets", perCollection: "assetsVisibilityState" },
    objects: {
        opacity: "genericObjectsOpacity",
        highlight: "highlightAllGenericObjects",
        hide: "hideAllGenericObjects",
        deep: "genericObjectsShowDeepObjects",
        perCollection: "genericObjectsVisibilityState",
    },
    fem: {
        opacity: "femSimulationObjectsOpacity",
        highlight: "highlightAllFemSimulationObjects",
        hide: "hideAllFemSimulationObjects",
        perCollection: "femSimulationObjectsVisibilityState",
    },
};

const sentenceCase = (text: string) => (text ? text.charAt(0).toUpperCase() + text.slice(1).toLowerCase() : text);

const countByCollection = (objects: any[]) => {
    const counts: Record<string, number> = {};
    for (const obj of objects) {
        const name = obj?.collectionName ?? "General";
        counts[name] = (counts[name] ?? 0) + 1;
    }
    return counts;
};

export const Inspector: FC<InspectorProps> = ({
    opts,
    setOpts,
    sensorObjects,
    sensorCollectionNames,
    assetObjects,
    assetCollectionNames,
    genericObjects,
    genericObjectCollectionNames,
    femSimulationObjects,
    femSimObjectCollectionNames,
    femResultDates,
    femResultNames,
    digitalTwinSimulationFormat,
    getLastMeasurementsButtomLabel,
    lockReadingButtomLabel,
    handleGetLastMeasurementsButton,
    handleLockReadMeasurementsButtonClick,
}) => {
    const [tab, setTab] = useState<TabId>(uiMemory.tab);
    const [open, setOpen] = useState<Record<string, boolean>>(uiMemory.open);
    const [filter, setFilter] = useState("");

    useEffect(() => {
        uiMemory.tab = tab;
        uiMemory.open = open;
    }, [tab, open]);

    const simulatorParams = Object.keys(digitalTwinSimulationFormat ?? {});
    const tabs = useMemo(() => {
        const list: { id: TabId; label: string; title?: string; icon: ReactNode }[] = [
            { id: "scene", label: "Scene", icon: <Sun /> },
        ];
        if (sensorObjects.length) list.push({ id: "sensors", label: "Sensors", icon: <Radio /> });
        if (assetObjects.length) list.push({ id: "assets", label: "Assets", icon: <Wrench /> });
        if (genericObjects.length) list.push({ id: "objects", label: "Generic", title: "Generic objects", icon: <Layers /> });
        if (femSimulationObjects.length) list.push({ id: "fem", label: "FEM", icon: <Grid3x3 /> });
        if (simulatorParams.length) list.push({ id: "simulator", label: "Sim.", title: "Digital twin simulator", icon: <SlidersHorizontal /> });
        list.push({ id: "system", label: "System", icon: <Cpu /> });
        return list;
    }, [sensorObjects.length, assetObjects.length, genericObjects.length, femSimulationObjects.length, simulatorParams.length]);

    const activeTab: TabId = tabs.some((t) => t.id === tab) ? tab : "scene";

    const set = (path: string[], value: unknown) => setOpts((prev) => withOptionAt(prev, path, value));
    const o = opts as unknown as Record<string, any>;
    const isOpen = (key: string, fallback = false) => open[key] ?? fallback;
    const toggle = (key: string, fallback = false) => setOpen((prev) => ({ ...prev, [key]: !(prev[key] ?? fallback) }));

    const resetScene = () =>
        setOpts((prev) => ({
            ...clonePlain(prev),
            environment: DEFAULT_VIEWER_OPTIONS.environment,
            ambientLight: DEFAULT_VIEWER_OPTIONS.ambientLight,
            ambientLightIntensity: DEFAULT_VIEWER_OPTIONS.ambientLightIntensity,
            spotLight: DEFAULT_VIEWER_OPTIONS.spotLight,
            spotLightPower: DEFAULT_VIEWER_OPTIONS.spotLightPower,
            showSpotLightHelper: DEFAULT_VIEWER_OPTIONS.showSpotLightHelper,
            pointLight: DEFAULT_VIEWER_OPTIONS.pointLight,
            pointLightPower: DEFAULT_VIEWER_OPTIONS.pointLightPower,
            showPointLightHelper: DEFAULT_VIEWER_OPTIONS.showPointLightHelper,
            showShadows: DEFAULT_VIEWER_OPTIONS.showShadows,
            showAxes: DEFAULT_VIEWER_OPTIONS.showAxes,
            axesScale: DEFAULT_VIEWER_OPTIONS.axesScale,
        }));

    // ---------------------------------------------------------------- pestañas

    const sceneTab = () => (
        <>
            <Section title="Environment" open={isOpen("environment")} onToggle={() => toggle("environment")}>
                <SelectField
                    id="inspector-environment"
                    label="Preset"
                    value={opts.environment}
                    options={ENVIRONMENT_OPTIONS}
                    onChange={(value) => set(["environment"], value)}
                />
                <SwitchRow label="Shadows" checked={!!opts.showShadows} onChange={(v) => set(["showShadows"], v)} />
                <SwitchRow label="Axes" checked={!!opts.showAxes} onChange={(v) => set(["showAxes"], v)} />
                <SliderField
                    id="inspector-axes-scale"
                    label="Axes length"
                    unit="×"
                    value={opts.axesScale ?? 1}
                    min={0.1}
                    max={10}
                    step={0.1}
                    disabled={!opts.showAxes}
                    onChange={(v) => set(["axesScale"], v)}
                />
            </Section>
            <Section
                title="Ambient light"
                open={isOpen("ambient")}
                onToggle={() => toggle("ambient")}
                switchChecked={!!opts.ambientLight}
                onSwitchChange={(v) => set(["ambientLight"], v)}
            >
                <SliderField
                    id="inspector-ambient-intensity"
                    label="Intensity"
                    value={opts.ambientLightIntensity}
                    min={0}
                    max={10}
                    step={0.05}
                    disabled={!opts.ambientLight}
                    onChange={(v) => set(["ambientLightIntensity"], v)}
                />
            </Section>
            <Section
                title="Spot light"
                open={isOpen("spot")}
                onToggle={() => toggle("spot")}
                switchChecked={!!opts.spotLight}
                onSwitchChange={(v) => set(["spotLight"], v)}
            >
                <SliderField
                    id="inspector-spot-power"
                    label="Power"
                    unit="lm"
                    value={opts.spotLightPower}
                    min={0}
                    max={5000}
                    step={5}
                    disabled={!opts.spotLight}
                    onChange={(v) => set(["spotLightPower"], v)}
                />
                <SwitchRow
                    label="Show helper"
                    checked={!!opts.showSpotLightHelper}
                    disabled={!opts.spotLight}
                    onChange={(v) => set(["showSpotLightHelper"], v)}
                />
            </Section>
            <Section
                title="Point light"
                open={isOpen("point")}
                onToggle={() => toggle("point")}
                switchChecked={!!opts.pointLight}
                onSwitchChange={(v) => set(["pointLight"], v)}
            >
                <SliderField
                    id="inspector-point-power"
                    label="Power"
                    unit="lm"
                    value={opts.pointLightPower}
                    min={0}
                    max={5000}
                    step={10}
                    disabled={!opts.pointLight}
                    onChange={(v) => set(["pointLightPower"], v)}
                />
                <SwitchRow
                    label="Show helper"
                    checked={!!opts.showPointLightHelper}
                    disabled={!opts.pointLight}
                    onChange={(v) => set(["showPointLightHelper"], v)}
                />
            </Section>
        </>
    );

    const collectionActions = (
        kind: CollectionKind,
        state: { highlight: boolean; hide: boolean; marker?: boolean },
        paths: { highlight: string[]; hide: string[]; marker?: string[] },
        name: string,
    ) => (
        <>
            <IconToggle
                type="button"
                $active={state.highlight}
                aria-pressed={state.highlight}
                aria-label={`Highlight ${name}`}
                title="Highlight"
                onClick={() => set(paths.highlight, !state.highlight)}
            >
                <Lightbulb aria-hidden="true" />
            </IconToggle>
            {kind === "sensors" && paths.marker && (
                <IconToggle
                    type="button"
                    $active={!!state.marker}
                    aria-pressed={!!state.marker}
                    aria-label={`Sensor marker ${name}`}
                    title="Sensor marker"
                    onClick={() => set(paths.marker!, !state.marker)}
                >
                    <MapPin aria-hidden="true" />
                </IconToggle>
            )}
            <IconToggle
                type="button"
                $active={state.hide}
                aria-pressed={state.hide}
                aria-label={`Hide ${name}`}
                title={state.hide ? "Hidden" : "Hide"}
                onClick={() => set(paths.hide, !state.hide)}
            >
                {state.hide ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
            </IconToggle>
        </>
    );

    const femCollectionExtras = (prefix: string[], idBase: string, state: Record<string, any>) => (
        <>
            <SelectField
                id={`${idBase}-result`}
                label="Result"
                value={state.femSimulationResult ?? "None result"}
                options={["None result", ...femResultNames]}
                onChange={(v) => set([...prefix, "femSimulationResult"], v)}
            />
            <SwitchRow
                label="Deformation"
                checked={!!state.showDeformation}
                onChange={(v) => set([...prefix, "showDeformation"], v)}
            />
            <SwitchRow label="Show mesh" checked={!!state.showMesh} onChange={(v) => set([...prefix, "showMesh"], v)} />
        </>
    );

    const collectionsTab = (kind: CollectionKind, objects: any[], names: string[], title: string) => {
        const keys = COLLECTION_KEYS[kind];
        const counts = countByCollection(objects);
        const several = names.length > 1;
        const allName = several ? "All collections" : names[0] ?? "All";
        const allOpenKey = `${kind}:__all__`;
        const query = filter.trim().toLowerCase();
        const visibleNames = several ? names.filter((name) => name.toLowerCase().includes(query)) : [];

        const allRow = (
            <CollectionRow
                key="__all__"
                name={allName}
                count={objects.length}
                emphasized
                open={isOpen(allOpenKey, true)}
                onToggleOpen={() => toggle(allOpenKey, true)}
                hidden={!!o[keys.hide]}
                actions={collectionActions(
                    kind,
                    { highlight: !!o[keys.highlight], hide: !!o[keys.hide], marker: keys.marker ? !!o[keys.marker] : undefined },
                    { highlight: [keys.highlight], hide: [keys.hide], marker: keys.marker ? [keys.marker] : undefined },
                    allName,
                )}
            >
                <SliderField
                    id={`inspector-${kind}-opacity`}
                    label="Opacity"
                    value={o[keys.opacity]}
                    min={0}
                    max={1}
                    step={0.05}
                    onChange={(v) => set([keys.opacity], v)}
                />
                {keys.deep && (
                    <SwitchRow label="Show deep objects" checked={!!o[keys.deep]} onChange={(v) => set([keys.deep!], v)} />
                )}
            </CollectionRow>
        );

        return (
            <>
                {kind === "fem" && (
                    <Section title="Results" open={isOpen("femResults")} onToggle={() => toggle("femResults")}>
                        <SelectField
                            id="inspector-fem-date"
                            label="Date"
                            value={opts.femResultDate}
                            options={femResultDates}
                            onChange={(v) => set(["femResultDate"], v)}
                        />
                        <SelectField
                            id="inspector-fem-result"
                            label="Result"
                            value={opts.femSimulationResult}
                            options={["None result", ...femResultNames]}
                            onChange={(v) => set(["femSimulationResult"], v)}
                        />
                        <SwitchRow
                            label="Deformation"
                            checked={!!opts.showFemSimulationDeformation}
                            onChange={(v) => set(["showFemSimulationDeformation"], v)}
                        />
                        <SliderField
                            id="inspector-fem-scale"
                            label="Log deformation scale"
                            value={opts.femSimulationDefScale}
                            min={-2}
                            max={10}
                            step={0.01}
                            onChange={(v) => set(["femSimulationDefScale"], v)}
                        />
                        <SwitchRow
                            label="Show meshes"
                            checked={!!opts.showAllFemSimulationMeshes}
                            onChange={(v) => set(["showAllFemSimulationMeshes"], v)}
                        />
                        <SelectField
                            id="inspector-fem-legend"
                            label="Legend"
                            value={opts.legendToShow}
                            options={["None result", ...femResultNames]}
                            onChange={(v) => set(["legendToShow"], v)}
                        />
                        <SwitchRow
                            label="Hide legend"
                            checked={!!opts.hideFemSimulationLegend}
                            onChange={(v) => set(["hideFemSimulationLegend"], v)}
                        />
                    </Section>
                )}
                {names.length > 6 && (
                    <FilterBox>
                        <Search aria-hidden="true" />
                        <input
                            type="text"
                            aria-label="Filter collections"
                            placeholder="Filter collections"
                            value={filter}
                            onChange={(event) => setFilter(event.target.value)}
                        />
                    </FilterBox>
                )}
                <GroupLabel>{title}</GroupLabel>
                <CollectionList>
                    {allRow}
                    {visibleNames.map((name) => {
                        const prefix = [keys.perCollection, name];
                        const state = (o[keys.perCollection]?.[name] ?? {}) as Record<string, any>;
                        const openKey = `${kind}:${name}`;
                        const idBase = `inspector-${kind}-${name.replace(/[^A-Za-z0-9_-]/g, "_")}`;
                        return (
                            <CollectionRow
                                key={name}
                                name={name}
                                count={counts[name]}
                                open={isOpen(openKey)}
                                onToggleOpen={() => toggle(openKey)}
                                hidden={!!state.hide}
                                actions={collectionActions(
                                    kind,
                                    { highlight: !!state.highlight, hide: !!state.hide, marker: !!state.showSensorMarker },
                                    {
                                        highlight: [...prefix, "highlight"],
                                        hide: [...prefix, "hide"],
                                        marker: [...prefix, "showSensorMarker"],
                                    },
                                    name,
                                )}
                            >
                                {kind === "fem" && femCollectionExtras(prefix, idBase, state)}
                                <SliderField
                                    id={`${idBase}-opacity`}
                                    label="Opacity"
                                    value={typeof state.opacity === "number" ? state.opacity : 1}
                                    min={0}
                                    max={1}
                                    step={0.05}
                                    onChange={(v) => set([...prefix, "opacity"], v)}
                                />
                                {kind === "objects" && (
                                    <SwitchRow
                                        label="Show deep objects"
                                        checked={!!state.showDeepObjects}
                                        onChange={(v) => set([...prefix, "showDeepObjects"], v)}
                                    />
                                )}
                            </CollectionRow>
                        );
                    })}
                    {several && visibleNames.length === 0 && <EmptyText>No collection matches “{filter}”.</EmptyText>}
                </CollectionList>
            </>
        );
    };

    const simulatorTab = () => (
        <Section title="Digital twin simulator" open={isOpen("simulator", true)} onToggle={() => toggle("simulator", true)}>
            {simulatorParams.map((paramName) => {
                const format = digitalTwinSimulationFormat[paramName] ?? {};
                const label = format.label !== undefined ? format.label : paramName;
                return (
                    <SliderField
                        key={paramName}
                        id={`inspector-sim-${paramName.replace(/[^A-Za-z0-9_-]/g, "_")}`}
                        label={label}
                        unit={format.units}
                        value={opts.digitalTwinSimulatorState?.[paramName]}
                        min={Number(format.minValue ?? 0)}
                        max={Number(format.maxValue ?? 1)}
                        step={Number(format.step ?? 0.01)}
                        onChange={(v) => set(["digitalTwinSimulatorState", paramName], v)}
                    />
                );
            })}
            <ButtonStack>
                <PrimaryButton type="button" onClick={handleGetLastMeasurementsButton}>
                    {sentenceCase(getLastMeasurementsButtomLabel)}
                </PrimaryButton>
                <SecondaryButton type="button" onClick={handleLockReadMeasurementsButtonClick}>
                    {/^UNLOCK/i.test(lockReadingButtomLabel) ? <LockOpen aria-hidden="true" /> : <Lock aria-hidden="true" />}
                    {sentenceCase(lockReadingButtomLabel)}
                </SecondaryButton>
            </ButtonStack>
        </Section>
    );

    const systemTab = () => (
        <Section
            title="Web workers"
            open={isOpen("workers", true)}
            onToggle={() => toggle("workers", true)}
            switchChecked={!!opts.enableWebWorkes}
            onSwitchChange={(v) => set(["enableWebWorkes"], v)}
        >
            <SliderField
                id="inspector-workers"
                label="Workers"
                value={opts.numWebWorkers}
                min={1}
                max={Math.max(1, window.navigator.hardwareConcurrency || 1)}
                step={1}
                disabled={!opts.enableWebWorkes}
                onChange={(v) => set(["numWebWorkers"], v)}
            />
            <SwitchRow label="Log elapsed time" checked={!!opts.logElapsedTime} onChange={(v) => set(["logElapsedTime"], v)} />
        </Section>
    );

    const content = () => {
        switch (activeTab) {
            case "sensors":
                return collectionsTab("sensors", sensorObjects, sensorCollectionNames, "Sensor collections");
            case "assets":
                return collectionsTab("assets", assetObjects, assetCollectionNames, "Asset collections");
            case "objects":
                return collectionsTab("objects", genericObjects, genericObjectCollectionNames, "Generic object collections");
            case "fem":
                return collectionsTab("fem", femSimulationObjects, femSimObjectCollectionNames, "FEM objects");
            case "simulator":
                return simulatorTab();
            case "system":
                return systemTab();
            default:
                return sceneTab();
        }
    };

    return (
        <Panel aria-label="Viewer settings" data-testid="viewer-inspector">
            <TabList role="tablist" aria-label="Settings" $count={tabs.length}>
                {tabs.map((t) => (
                    <Tab
                        key={t.id}
                        type="button"
                        role="tab"
                        aria-selected={t.id === activeTab}
                        $selected={t.id === activeTab}
                        title={t.title ?? t.label}
                        aria-label={t.title ?? t.label}
                        onClick={() => {
                            setTab(t.id);
                            setFilter("");
                        }}
                    >
                        {t.icon}
                        <span>{t.label}</span>
                    </Tab>
                ))}
            </TabList>
            <Body role="tabpanel">{content()}</Body>
            {activeTab === "scene" && (
                <Footer>
                    <span>Changes apply live</span>
                    <SmallButton type="button" onClick={resetScene}>
                        <RotateCcw aria-hidden="true" />
                        Reset scene
                    </SmallButton>
                </Footer>
            )}
        </Panel>
    );
};

export default Inspector;
