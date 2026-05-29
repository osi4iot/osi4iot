import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { X, Save, RotateCcw, Bug } from "lucide-react";
import { indentUnit, indentOnInput } from "@codemirror/language";
import { completionKeymap } from "@codemirror/autocomplete";
import { indentWithTab } from "@codemirror/commands";

// Importaciones de CodeMirror
import CodeMirror, { keymap, hoverTooltip } from "@uiw/react-codemirror";
import { javascript, javascriptLanguage } from "@codemirror/lang-javascript";
import { sql } from "@codemirror/lang-sql";
import { oneDark } from "@codemirror/theme-one-dark";
import { useUpdateNodeInternals } from "@xyflow/react";
import { useFormChanges } from "../Utils/customHooks";
import { IMqttTopicData, INatsSubjectData } from "../Main/Model";
import { json } from "@codemirror/lang-json";
import { IDigitalTwin } from "../../TableColumns/digitalTwinsColumns";
import { useMlModelsTableInGroup } from "../../../../contexts/platformAssistantContext/platformAssistantContext";
import { TimeSelector } from "./Utils/TimeSelector";
import { timezoneOptions } from "./Utils/timezones";
import {
    PanelContainer,
    PanelHeader,
    PanelTitle,
    CloseButton,
    FormGroup,
    Label,
    Input,
    CheckboxGroup,
    CheckboxItem,
    CheckboxInput,
    Select,
    TextArea,
    TextAreaSystemPrompt,
    ButtonGroup,
    Button,
    TabsContainer,
    TabContent,
    Tab,
    PanelContent,
    TabContentFunction,
    ReIndentCommand,
    CheckboxContainer,
    ResizeHandle,
    NodeTypeIndicator,
    HeaderControls,
    DebugToggle,
} from "./types";
import IAssetS3Folder from "../../TableColumns/assetS3FolderColumns";
import { CodeMirrorWrapper } from "../../../Tools/CodeMirrorWrapper";

//New
import { buildEditorExtensions, disposeEditor, restartEditor } from "./editor";
import { NODE_FUNCTION_SCRIPTS } from "./NodePalette";
import { HelpTab } from "./HelpTab";
import { IGroup } from "../../TableColumns/groupsColumns";

const CODEMIRROR_SETUP = {
    lineNumbers: true,
    foldGutter: true,
    bracketMatching: true,
    closeBrackets: true,
    syntaxHighlighting: true,
    autocompletion: true,
    tabSize: 4,
    searchKeymap: true,
} as const;

const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const MAX_WIDTH = 1370;
const MIN_WIDTH = 550;

const handleDayChange = (
    selectedDay: string,
    isChecked: boolean,
    formData: any,
    handleInputChange: (field: string, value: any) => void,
) => {
    const currentDays = formData.daysOfWeek || [];
    let updatedDays;

    if (isChecked) {
        updatedDays = [...currentDays, selectedDay];
    } else {
        updatedDays = currentDays.filter((day: string) => day !== selectedDay);
    }

    handleInputChange("daysOfWeek", updatedDays);
};

const SystemMonitoringTopicMap = new Map();
SystemMonitoringTopicMap.set("system_1", "System logs");
SystemMonitoringTopicMap.set("system_2", "Host metrics");
SystemMonitoringTopicMap.set("system_3", "Container metrics");
SystemMonitoringTopicMap.set("system_4", "Volume metrics");
SystemMonitoringTopicMap.set("system_5", "System alert");

export interface NodeData {
    label: string;
    nodeUid: string;
    debug: string;
    numOutputs: number;
    settings: any;
}

interface NodePropertiesPanelProps {
    isOpen: boolean;
    onClose: () => void;
    selectedNode: {
        id: string;
        type: string;
        position: { x: number; y: number };
        data: NodeData;
    } | null;
    onUpdateNode: (nodeId: string, newData: Partial<NodeData>) => void;
    digitalTwinSelected: IDigitalTwin;
    groupSelected: IGroup;
    handlePipelineUiChanged: (isPipelineUiChanged: any) => void;
    natsSubjectsData: INatsSubjectData[];
    assetS3Folders: IAssetS3Folder[];
}

interface SysMonitoringTopic {
    topicRef: string;
    description: string;
}

const NodePropertiesPanel: React.FC<NodePropertiesPanelProps> = ({
    isOpen,
    onClose,
    selectedNode,
    onUpdateNode,
    digitalTwinSelected,
    groupSelected,
    handlePipelineUiChanged,
    natsSubjectsData,
    assetS3Folders,
}) => {
    const [isClosing, setIsClosing] = useState(false);
    const [formData, setFormData] = useState<any>({});
    const [activeTab, setActiveTab] = useState<string>("settings");
    const [isDebugEnabled, setIsDebugEnabled] = useState(false);
    const { hasChanges, setOriginalData, createInputChangeHandler, createDebugToggleHandler } =
        useFormChanges(selectedNode);
    const updateNodeInternals = useUpdateNodeInternals();
    const [listenTopicsRef, setListenTopicsRef] = useState<string[]>([]);
    const [publishTopicsRef, setPublishTopicsRef] = useState<string[]>([]);
    const [dev2pdbTopicsRef, setDev2pdbTopicsRef] = useState<string[]>([]);
    const [systemMonitoringTopicsRef, setSystemMonitoringTopicsRef] = useState<SysMonitoringTopic[]>([]);

    // Estados para el redimensionamiento - Enfoque híbrido optimizado
    const [width, setWidth] = useState(MIN_WIDTH);
    const [isDragging, setIsDragging] = useState(false);
    const dragStartRef = useRef({ x: 0, widthInicial: 0 });
    const panelRef = useRef<HTMLDivElement>(null);
    const mlModelsTable = useMlModelsTableInGroup(digitalTwinSelected.groupId);

    // Función para actualizar el width usando CSS nativo
    const updatePanelWidth = useCallback((newWidth: number) => {
        if (panelRef.current) {
            panelRef.current.style.setProperty("--panel-width", `${newWidth}px`);
            setWidth(newWidth);
        }
    }, []);

    // Manejar clases CSS para el estado de dragging
    const setDraggingClass = useCallback((dragging: boolean) => {
        if (panelRef.current) {
            if (dragging) {
                panelRef.current.classList.add("dragging");
            } else {
                panelRef.current.classList.remove("dragging");
            }
        }
    }, []);

    const startDrag = useCallback(
        (e: React.MouseEvent) => {
            setIsDragging(true);
            setDraggingClass(true);
            dragStartRef.current = {
                x: e.clientX,
                widthInicial: width,
            };

            document.body.style.userSelect = "none";
            document.body.style.cursor = "ew-resize";
        },
        [width, setDraggingClass],
    );

    const handleDrag = useCallback(
        (e: MouseEvent) => {
            if (!isDragging) return;

            const deltaX = e.clientX - dragStartRef.current.x;
            const newWidth = dragStartRef.current.widthInicial + deltaX;

            const widthMin = MIN_WIDTH;
            const widthMax = MAX_WIDTH;

            if (newWidth >= widthMin && newWidth <= widthMax) {
                // Solo actualización CSS, sin setState durante el drag
                updatePanelWidth(newWidth);
            }
        },
        [isDragging, updatePanelWidth],
    );

    const finishDrag = useCallback(() => {
        setIsDragging(false);
        setDraggingClass(false);
        document.body.style.userSelect = "";
        document.body.style.cursor = "";

        // Sincronizar el estado final con el valor actual del CSS
        if (panelRef.current) {
            const computedWidth = panelRef.current.offsetWidth;
            setWidth(computedWidth);
        }
    }, [setDraggingClass]);

    useEffect(() => {
        if (isDragging) {
            document.addEventListener("mousemove", handleDrag);
            document.addEventListener("mouseup", finishDrag);

            return () => {
                document.removeEventListener("mousemove", handleDrag);
                document.removeEventListener("mouseup", finishDrag);
            };
        }
    }, [isDragging, handleDrag, finishDrag]);

    // Inicializar CSS custom property
    useEffect(() => {
        if (panelRef.current) {
            panelRef.current.style.setProperty("--panel-width", `${width}px`);
        }
    }, [width]);

    useEffect(() => {
        const listenTopics: string[] = [];
        const publishTopics: string[] = [];
        const dev2pdbTopics: string[] = [];
        const systemMonitoringTopics: SysMonitoringTopic[] = [];

        natsSubjectsData.forEach((subjectData) => {
            if (subjectData.topicRef.slice(0, 7) === "dev2pdb") {
                publishTopics.push(subjectData.topicRef);
                dev2pdbTopics.push(subjectData.topicRef);
            }
            if (
                groupSelected.isAdminGroup &&
                digitalTwinSelected.description === "System monitoring" &&
                subjectData.topicRef.indexOf("system_") !== -1
            ) {
                const sysMonDescription = SystemMonitoringTopicMap.get(subjectData.topicRef);
                if (sysMonDescription) {
                    systemMonitoringTopics.push({ topicRef: subjectData.topicRef, description: sysMonDescription });
                }
            }
        });

        if (groupSelected.isAdminGroup && digitalTwinSelected.description === "System monitoring") {
            publishTopics.push("System alert");
        } else {
            listenTopics.push("sim2dtm", "dev2dtm", "sim2llm", "sim2state");
            publishTopics.push(
                "dtm2sim",
                "sim2dtm",
                "dtm2pdb",
                "dev2dtm",
                "dtm2dev",
                "dev2sim",
                "sim2llm",
                "llm2sim",
                "state2sim",
                "sim2state",
            );
        }

        setListenTopicsRef(listenTopics);
        setPublishTopicsRef(publishTopics);
        setDev2pdbTopicsRef(dev2pdbTopics);
        setSystemMonitoringTopicsRef(systemMonitoringTopics);
    }, [natsSubjectsData]);

    useEffect(() => {
        if (selectedNode) {
            if (selectedNode.type === "MlModel" && mlModelsTable.length > 0) {
                if (selectedNode.data.settings?.mlModelId === 0) {
                    selectedNode.data.settings.mlModelId = mlModelsTable[0].id;
                }
            }
            const initialData = {
                label: selectedNode.data.label,
                numOutputs: selectedNode.data.numOutputs,
                debug: selectedNode.data.debug || "off",
                ...selectedNode.data.settings,
            };

            setFormData(initialData);
            setOriginalData(initialData, selectedNode.type);
            setIsDebugEnabled(selectedNode.data.debug === "on");

            if (selectedNode.type === "Function") {
                setActiveTab("onMessage");
            } else {
                setActiveTab("settings");
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedNode, setOriginalData]);

    const handleClose = useCallback(() => {
        setIsClosing(true);
        setWidth(MIN_WIDTH); // Reinitialize width on close
        setTimeout(() => {
            setIsClosing(false);
            onClose();
        }, 300);
    }, [onClose]);

    const handleInputChange = useMemo(() => createInputChangeHandler(setFormData), [createInputChangeHandler]);

    const handleDebugToggle = useMemo(
        () => createDebugToggleHandler(setFormData, isDebugEnabled, setIsDebugEnabled),
        [createDebugToggleHandler, isDebugEnabled],
    );

    const handleSave = useCallback(() => {
        if (!selectedNode) return;

        const { label, numOutputs, debug, ...settings } = formData;
        const newNodeData = {
            label,
            numOutputs,
            debug,
            settings: { ...settings },
        };

        onUpdateNode(selectedNode.id, newNodeData);
        updateNodeInternals(selectedNode.id);

        // Actualizar datos originales después de guardar
        setOriginalData(formData, selectedNode.type);

        if (hasChanges) {
            handlePipelineUiChanged(true);
        }

        handleClose();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedNode, formData, onUpdateNode, handleClose, setOriginalData, hasChanges]);

    const handleReset = useCallback(() => {
        if (selectedNode) {
            const resetData = {
                label: selectedNode.data.label,
                numOutputs: selectedNode.data.numOutputs || 1,
                debug: selectedNode.data.debug || "off",
                ...selectedNode.data.settings,
            };

            setFormData(resetData);
            setOriginalData(resetData, selectedNode.type);
            setIsDebugEnabled(selectedNode.data.debug === "on");
        }
    }, [selectedNode, setOriginalData]);

    // Función para determinar si un nodo debe mostrar el selector de outputs
    const shouldShowOutputSelector = (nodeType: string) => {
        const excludedTypes = ["Publish", "Email", "Splitter"];
        return !excludedTypes.includes(nodeType);
    };

    const codeMirrorSqlExtensions = useMemo(
        () => [
            sql(),
            indentUnit.of("    "),
            indentOnInput(),
            keymap.of([...completionKeymap, indentWithTab, ReIndentCommand]),
        ],
        [],
    );

    const codeMirrorJSExtensions = useMemo(
        () =>
            buildEditorExtensions({
                lintDelay: 500, // ms de debounce (default 500)
                showLintGutter: true, // iconos de error en el gutter izquierdo (default true)
            }),
        [],
    );

    useEffect(() => {
        restartEditor();
        return () => disposeEditor();
    }, []);

    // Renderizar el selector de número de outputs
    const renderOutputSelector = () => {
        if (!selectedNode || !shouldShowOutputSelector(selectedNode.type)) {
            return null;
        }

        return (
            <FormGroup>
                <Label>Number of outputs</Label>
                <Input
                    type="number"
                    step="1"
                    value={formData.numOutputs || 0}
                    onChange={(e: { target: { value: string } }) =>
                        handleInputChange("numOutputs", Math.max(0, parseInt(e.target.value)))
                    }
                    placeholder="1"
                />
            </FormGroup>
        );
    };

    // Renderizar las pestañas para nodos Function
    const renderFunctionTabs = () => {
        const tabs = [
            { id: "settings", label: "Settings" },
            { id: "onInitiation", label: "On Init" },
            { id: "onStart", label: "On Start" },
            { id: "onMessage", label: "On Message" },
            { id: "help", label: "Help" },
        ];

        return (
            <>
                <TabsContainer>
                    {tabs.map((tab) => (
                        <Tab key={tab.id} isActive={activeTab === tab.id} onClick={() => setActiveTab(tab.id)}>
                            {tab.label}
                        </Tab>
                    ))}
                </TabsContainer>
                <PanelContent>
                    <TabContentFunction>
                        {activeTab === "settings" && (
                            <>
                                <FormGroup>
                                    <Label>Node Name</Label>
                                    <Input
                                        type="text"
                                        value={formData.label || ""}
                                        onChange={(e: { target: { value: any } }) =>
                                            handleInputChange("label", e.target.value)
                                        }
                                        placeholder="Node name"
                                    />
                                </FormGroup>
                                {renderOutputSelector()}
                            </>
                        )}
                        {(["onInitiation", "onStart", "onMessage"] as const).map((tabId) =>
                            activeTab === tabId ? (
                                <CodeMirrorWrapper key={tabId}>
                                    <CodeMirror
                                        key={tabId}
                                        value={formData[`${tabId}Script`] ?? NODE_FUNCTION_SCRIPTS[tabId]}
                                        height="auto"
                                        minHeight="500px"
                                        extensions={codeMirrorJSExtensions}
                                        theme={oneDark}
                                        onChange={(value) => handleInputChange(`${tabId}Script`, value)}
                                        basicSetup={CODEMIRROR_SETUP}
                                    />
                                </CodeMirrorWrapper>
                            ) : null,
                        )}
                        {activeTab === "help" && <HelpTab nodeType="Function" />}
                    </TabContentFunction>
                </PanelContent>
            </>
        );
    };

    const renderInjectTabs = () => {
        const tabs = [
            { id: "settings", label: "Settings" },
            { id: "injection", label: "Injection" },
            { id: "help", label: "Help" },
        ];

        return (
            <>
                <TabsContainer>
                    {tabs.map((tab) => (
                        <Tab key={tab.id} isActive={activeTab === tab.id} onClick={() => setActiveTab(tab.id)}>
                            {tab.label}
                        </Tab>
                    ))}
                </TabsContainer>
                <PanelContent>
                    <TabContentFunction>
                        {activeTab === "settings" && (
                            <>
                                <FormGroup>
                                    <Label>Node Name</Label>
                                    <Input
                                        type="text"
                                        value={formData.label || ""}
                                        onChange={(e: { target: { value: any } }) =>
                                            handleInputChange("label", e.target.value)
                                        }
                                        placeholder="Node name"
                                    />
                                </FormGroup>
                                {renderOutputSelector()}
                                <FormGroup>
                                    <Label>Repeat</Label>
                                    <Select
                                        value={formData.repeat || "none"}
                                        onChange={(e: { target: { value: any } }) =>
                                            handleInputChange("repeat", e.target.value)
                                        }
                                    >
                                        <option value="none">None</option>
                                        <option value="interval">Interval</option>
                                        <option value="interval_between_times">Interval between times</option>
                                        <option value="interval_at_specific_time">Interval at specific time</option>
                                    </Select>
                                </FormGroup>
                                {(formData.repeat === "interval" || formData.repeat === "interval_between_times") && (
                                    <FormGroup>
                                        <Label>Every (seconds)</Label>
                                        <Input
                                            type="number"
                                            step="0.1"
                                            value={formData.every || 0}
                                            onChange={(e: { target: { value: string } }) =>
                                                handleInputChange("every", Math.max(0, parseFloat(e.target.value)))
                                            }
                                            placeholder="1.0"
                                        />
                                    </FormGroup>
                                )}
                                {formData.repeat === "interval_between_times" && (
                                    <>
                                        <TimeSelector
                                            value={formData.startTime || "00:00"}
                                            onChange={(value) => handleInputChange("startTime", value)}
                                            label="Start time"
                                        />
                                        <TimeSelector
                                            value={formData.endTime || "01:00"}
                                            onChange={(value) => handleInputChange("endTime", value)}
                                            label="End time"
                                        />
                                    </>
                                )}
                                {formData.repeat === "interval_at_specific_time" && (
                                    <TimeSelector
                                        value={formData.specificTime || "00:00"}
                                        onChange={(value) => handleInputChange("specificTime", value)}
                                        label="Specific time"
                                    />
                                )}
                                {(formData.repeat === "interval_between_times" ||
                                    formData.repeat === "interval_at_specific_time") && (
                                    <>
                                        <FormGroup>
                                            <Label>Timezone</Label>
                                            <Select
                                                value={formData.timezone || "Europe/Madrid"}
                                                onChange={(e: { target: { value: any } }) =>
                                                    handleInputChange("timezone", e.target.value)
                                                }
                                            >
                                                {timezoneOptions.map((option) => (
                                                    <option key={option.value} value={option.value}>
                                                        {option.label}
                                                    </option>
                                                ))}
                                            </Select>
                                        </FormGroup>
                                        <FormGroup>
                                            <Label>Days of the week</Label>
                                            <CheckboxGroup>
                                                {daysOfWeek.map((day) => (
                                                    <CheckboxItem
                                                        key={day}
                                                        data-checked={formData.daysOfWeek?.includes(day) || false}
                                                    >
                                                        <CheckboxInput
                                                            type="checkbox"
                                                            checked={formData.daysOfWeek?.includes(day) || false}
                                                            onChange={(e: { target: { checked: boolean } }) =>
                                                                handleDayChange(
                                                                    day,
                                                                    e.target.checked,
                                                                    formData,
                                                                    handleInputChange,
                                                                )
                                                            }
                                                        />
                                                        {day}
                                                    </CheckboxItem>
                                                ))}
                                            </CheckboxGroup>
                                        </FormGroup>
                                    </>
                                )}
                            </>
                        )}
                        {activeTab === "injection" && (
                            <>
                                <FormGroup>
                                    <Label>Injection type</Label>
                                    <Select
                                        value={formData.injectionType || "Timestamp"}
                                        onChange={(e: { target: { value: any } }) =>
                                            handleInputChange("injectionType", e.target.value)
                                        }
                                    >
                                        <option value="Timestamp">Timestamp</option>
                                        <option value="JSON">JSON</option>
                                    </Select>
                                </FormGroup>
                                {formData.injectionType === "JSON" && (
                                    <FormGroup>
                                        <Label>JSON</Label>
                                        <CodeMirrorWrapper>
                                            <CodeMirror
                                                value={formData.json || "{}"}
                                                height="auto"
                                                minHeight="350px"
                                                extensions={[
                                                    json(),
                                                    indentUnit.of("    "),
                                                    indentOnInput(),
                                                    keymap.of([...completionKeymap, indentWithTab, ReIndentCommand]),
                                                ]}
                                                theme={oneDark}
                                                onChange={(value) => handleInputChange("json", value)}
                                                basicSetup={{
                                                    lineNumbers: true,
                                                    foldGutter: true,
                                                    bracketMatching: true,
                                                    closeBrackets: true,
                                                    syntaxHighlighting: true,
                                                    autocompletion: true,
                                                    tabSize: 4,
                                                    searchKeymap: true,
                                                }}
                                            />
                                        </CodeMirrorWrapper>
                                    </FormGroup>
                                )}
                            </>
                        )}
                        {activeTab === "help" && <HelpTab nodeType="Inject" />}
                    </TabContentFunction>
                </PanelContent>
            </>
        );
    };

    const renderTriggerProperties = () => {
        const tabs = [
            { id: "settings", label: "Settings" },
            { id: "first_message", label: "First message" },
            { id: "second_message", label: "Second message" },
            { id: "help", label: "Help" },
        ];

        if (formData.sendMode !== "wait_for") {
            tabs.splice(2, 1); // Remove "Second message" tab if not needed
        }

        const sendModeOptions = [
            { value: "wait_for", label: "Wait for delay and then send second message" },
            { value: "resend_every", label: "Resend every" },
            { value: "wait_to_be_reset", label: "Wait to be reset" },
        ];

        const resetTriggerOptions = [
            { value: "msg.payload.reset", label: "msg.payload.reset is set" },
            { value: "optional msg.payload field", label: "Optional msg.payload field is set" },
        ];

        const firstMessageTypeOptions = [
            { value: "Timestamp", label: "Timestamp" },
            { value: "first_message", label: "Existing message object" },
            { value: "JSON", label: "Custom JSON" },
            { value: "nothing", label: "Nothing" },
        ];

        const secondMessageTypeOptions = [
            { value: "Timestamp", label: "Timestamp" },
            { value: "first_message", label: "Original message object" },
            { value: "latest_message", label: "Latest message object" },
            { value: "JSON", label: "Custom JSON" },
            { value: "nothing", label: "Nothing" },
        ];

        const handleMessagesOptions = [
            { value: "all", label: "All Messages" },
            { value: "stream_name", label: "By stream field in payload" },
        ];

        return (
            <>
                <TabsContainer>
                    {tabs.map((tab) => (
                        <Tab key={tab.id} isActive={activeTab === tab.id} onClick={() => setActiveTab(tab.id)}>
                            {tab.label}
                        </Tab>
                    ))}
                </TabsContainer>
                <PanelContent>
                    <TabContentFunction>
                        {activeTab === "settings" && (
                            <>
                                <FormGroup>
                                    <Label>Node Name</Label>
                                    <Input
                                        type="text"
                                        value={formData.label || ""}
                                        onChange={(e: { target: { value: any } }) =>
                                            handleInputChange("label", e.target.value)
                                        }
                                        placeholder="Node name"
                                    />
                                </FormGroup>
                                <FormGroup>
                                    <Label>Send first message and then</Label>
                                    <Select
                                        value={formData.sendMode || "wait_for"}
                                        onChange={(e: { target: { value: any } }) =>
                                            handleInputChange("sendMode", e.target.value)
                                        }
                                    >
                                        {sendModeOptions.map((option) => (
                                            <option key={option.value} value={option.value}>
                                                {option.label}
                                            </option>
                                        ))}
                                    </Select>
                                </FormGroup>
                                {(formData.sendMode === "wait_for" || formData.sendMode === "resend_every") && (
                                    <>
                                        {formData.sendMode === "wait_for" && (
                                            <FormGroup>
                                                <Label>Delay (seconds)</Label>
                                                <Input
                                                    type="number"
                                                    step="0.1"
                                                    value={formData.delay || 0}
                                                    onChange={(e: { target: { value: string } }) =>
                                                        handleInputChange(
                                                            "delay",
                                                            Math.max(0, parseFloat(e.target.value)),
                                                        )
                                                    }
                                                    placeholder="1.0"
                                                />
                                            </FormGroup>
                                        )}
                                        {formData.sendMode === "resend_every" && (
                                            <FormGroup>
                                                <Label>Every (seconds)</Label>
                                                <Input
                                                    type="number"
                                                    step="0.01"
                                                    value={formData.resendInterval || 0}
                                                    onChange={(e: { target: { value: string } }) =>
                                                        handleInputChange(
                                                            "resendInterval",
                                                            Math.max(0, parseFloat(e.target.value)),
                                                        )
                                                    }
                                                    placeholder="1.0"
                                                />
                                            </FormGroup>
                                        )}
                                        <CheckboxContainer>
                                            <CheckboxItem data-checked={formData.overrideDelay || false}>
                                                <CheckboxInput
                                                    type="checkbox"
                                                    checked={formData.overrideDelay || false}
                                                    onChange={(e: { target: { checked: any } }) =>
                                                        handleInputChange("overrideDelay", e.target.checked)
                                                    }
                                                    onClick={(e: { stopPropagation: () => any }) => e.stopPropagation()}
                                                />
                                                <span>Allow msg.payload.delay to override delay setting</span>
                                            </CheckboxItem>
                                        </CheckboxContainer>
                                    </>
                                )}
                                {formData.sendMode === "wait_for" && (
                                    <>
                                        <CheckboxContainer>
                                            <CheckboxItem data-checked={formData.extendDelay || false}>
                                                <CheckboxInput
                                                    type="checkbox"
                                                    checked={formData.extendDelay || false}
                                                    onChange={(e: { target: { checked: any } }) =>
                                                        handleInputChange("extendDelay", e.target.checked)
                                                    }
                                                    onClick={(e: { stopPropagation: () => any }) => e.stopPropagation()}
                                                />
                                                <span>Extend delay if new message arrives</span>
                                            </CheckboxItem>
                                        </CheckboxContainer>
                                    </>
                                )}
                                <FormGroup>
                                    <Label>Reset the trigger if:</Label>
                                    <Select
                                        value={formData.resetTriggerOption || "msg.payload.reset"}
                                        onChange={(e: { target: { value: any } }) =>
                                            handleInputChange("resetTriggerOption", e.target.value)
                                        }
                                    >
                                        {resetTriggerOptions.map((option) => (
                                            <option key={option.value} value={option.value}>
                                                {option.label}
                                            </option>
                                        ))}
                                    </Select>
                                </FormGroup>
                                {formData.resetTriggerOption === "optional msg.payload field" && (
                                    <FormGroup>
                                        <Label>Custom payload field</Label>
                                        <Input
                                            type="text"
                                            value={formData.customPayloadFieldForReset || ""}
                                            onChange={(e: { target: { value: any } }) =>
                                                handleInputChange("customPayloadFieldForReset", e.target.value)
                                            }
                                            placeholder="custom_field"
                                        />
                                    </FormGroup>
                                )}
                                <FormGroup>
                                    <Label>Handling</Label>
                                    <Select
                                        value={formData.handleMessagesBy || "all"}
                                        onChange={(e: { target: { value: any } }) =>
                                            handleInputChange("handleMessagesBy", e.target.value)
                                        }
                                    >
                                        {handleMessagesOptions.map((option) => (
                                            <option key={option.value} value={option.value}>
                                                {option.label}
                                            </option>
                                        ))}
                                    </Select>
                                </FormGroup>
                            </>
                        )}
                        {activeTab === "first_message" && (
                            <>
                                <FormGroup>
                                    <Label>Message type</Label>
                                    <Select
                                        value={formData.firstMessageType || "Timestamp"}
                                        onChange={(e: { target: { value: any } }) =>
                                            handleInputChange("firstMessageType", e.target.value)
                                        }
                                    >
                                        {firstMessageTypeOptions.map((option) => (
                                            <option key={option.value} value={option.value}>
                                                {option.label}
                                            </option>
                                        ))}
                                    </Select>
                                </FormGroup>
                                {formData.firstMessageType === "JSON" && (
                                    <FormGroup>
                                        <Label>JSON</Label>
                                        <CodeMirrorWrapper>
                                            <CodeMirror
                                                value={formData.firstMessagePayload || "{}"}
                                                height="auto"
                                                minHeight="350px"
                                                extensions={[
                                                    json(),
                                                    indentUnit.of("    "),
                                                    indentOnInput(),
                                                    keymap.of([...completionKeymap, indentWithTab, ReIndentCommand]),
                                                ]}
                                                theme={oneDark}
                                                onChange={(value) => handleInputChange("firstMessagePayload", value)}
                                                basicSetup={{
                                                    lineNumbers: true,
                                                    foldGutter: true,
                                                    bracketMatching: true,
                                                    closeBrackets: true,
                                                    syntaxHighlighting: true,
                                                    autocompletion: true,
                                                    tabSize: 4,
                                                    searchKeymap: true,
                                                }}
                                            />
                                        </CodeMirrorWrapper>
                                    </FormGroup>
                                )}
                            </>
                        )}
                        {formData.sendMode === "wait_for" && activeTab === "second_message" && (
                            <>
                                <FormGroup>
                                    <Label>Message</Label>
                                    <Select
                                        value={formData.secondMessageType || "Timestamp"}
                                        onChange={(e: { target: { value: any } }) =>
                                            handleInputChange("secondMessageType", e.target.value)
                                        }
                                    >
                                        {secondMessageTypeOptions.map((option) => (
                                            <option key={option.value} value={option.value}>
                                                {option.label}
                                            </option>
                                        ))}
                                    </Select>
                                </FormGroup>
                                {formData.secondMessageType === "JSON" && (
                                    <FormGroup>
                                        <Label>JSON</Label>
                                        <CodeMirrorWrapper>
                                            <CodeMirror
                                                value={formData.secondMessagePayload || "{}"}
                                                height="auto"
                                                minHeight="350px"
                                                extensions={[
                                                    json(),
                                                    indentUnit.of("    "),
                                                    indentOnInput(),
                                                    keymap.of([...completionKeymap, indentWithTab, ReIndentCommand]),
                                                ]}
                                                theme={oneDark}
                                                onChange={(value) => handleInputChange("secondMessagePayload", value)}
                                                basicSetup={{
                                                    lineNumbers: true,
                                                    foldGutter: true,
                                                    bracketMatching: true,
                                                    closeBrackets: true,
                                                    syntaxHighlighting: true,
                                                    autocompletion: true,
                                                    tabSize: 4,
                                                    searchKeymap: true,
                                                }}
                                            />
                                        </CodeMirrorWrapper>
                                    </FormGroup>
                                )}
                                <CheckboxContainer>
                                    <CheckboxItem data-checked={formData.separateOutput || false}>
                                        <CheckboxInput
                                            type="checkbox"
                                            checked={formData.separateOutput || false}
                                            onChange={(e: { target: { checked: any } }) => {
                                                if (e.target.checked) {
                                                    handleInputChange("numOutputs", 2);
                                                } else {
                                                    handleInputChange("numOutputs", 1);
                                                }
                                                handleInputChange("separateOutput", e.target.checked);
                                            }}
                                            onClick={(e: { stopPropagation: () => any }) => e.stopPropagation()}
                                        />
                                        <span>Send second message to separate output</span>
                                    </CheckboxItem>
                                </CheckboxContainer>
                            </>
                        )}
                        {activeTab === "help" && <HelpTab nodeType="Trigger" />}
                    </TabContentFunction>
                </PanelContent>
            </>
        );
    };

    const renderAiAgentTabs = () => {
        const tabs = [
            { id: "settings", label: "Settings" },
            { id: "system_prompt", label: "System prompt" },
            { id: "help", label: "Help" },
        ];

        return (
            <>
                <TabsContainer>
                    {tabs.map((tab) => (
                        <Tab key={tab.id} isActive={activeTab === tab.id} onClick={() => setActiveTab(tab.id)}>
                            {tab.label}
                        </Tab>
                    ))}
                </TabsContainer>
                <PanelContent>
                    <TabContentFunction>
                        {activeTab === "settings" && (
                            <>
                                <FormGroup>
                                    <Label>Node Name</Label>
                                    <Input
                                        type="text"
                                        value={formData.label || ""}
                                        onChange={(e: { target: { value: any } }) =>
                                            handleInputChange("label", e.target.value)
                                        }
                                        placeholder="Node name"
                                    />
                                </FormGroup>
                                {renderOutputSelector()}
                                <FormGroup>
                                    <Label>Model</Label>
                                    <Select
                                        value={formData.llmModel || "openai:gpt-oss-120b"}
                                        onChange={(e: { target: { value: any } }) =>
                                            handleInputChange("llmModel", e.target.value)
                                        }
                                    >
                                        <option value="openai:gpt-oss-120b">openai/gpt-oss-120b</option>
                                        <option value="openai:gpt-oss-20b">openai/gpt-oss-20b</option>
                                        <option value="openai:gpt-4o">openai/gpt-4o</option>
                                        <option value="openai:gpt-4o-mini">openai/gpt-4o-mini</option>
                                        <option value="openai:gpt-5-mini">openai/gpt-5-mini</option>
                                        <option value="openai:gpt-5-nano">openai/gpt-5-nano</option>
                                    </Select>
                                </FormGroup>
                                <FormGroup>
                                    <Label>Temperature</Label>
                                    <Input
                                        type="number"
                                        step="0.01"
                                        max="1.0"
                                        min="0.0"
                                        value={formData.llmTemperature || 0.7}
                                        onChange={(e: { target: { value: string } }) =>
                                            handleInputChange("llmTemperature", parseFloat(e.target.value))
                                        }
                                        placeholder="0.7"
                                    />
                                </FormGroup>
                                <FormGroup>
                                    <Label>Top K</Label>
                                    <Input
                                        type="number"
                                        step="1"
                                        max="100"
                                        min="1"
                                        value={formData.llmTopK || 40}
                                        onChange={(e: { target: { value: string } }) =>
                                            handleInputChange("llmTopK", parseInt(e.target.value))
                                        }
                                        placeholder="40"
                                    />
                                </FormGroup>
                                <FormGroup>
                                    <Label>Top P</Label>
                                    <Input
                                        type="number"
                                        step="0.01"
                                        max="1.0"
                                        min="0.0"
                                        value={formData.llmTopP || 0.95}
                                        onChange={(e: { target: { value: string } }) =>
                                            handleInputChange("llmTopP", parseFloat(e.target.value))
                                        }
                                        placeholder="0.95"
                                    />
                                </FormGroup>
                            </>
                        )}
                        {activeTab === "system_prompt" && (
                            <>
                                <FormGroup>
                                    {/* <Label>System Prompt</Label> */}
                                    <TextAreaSystemPrompt
                                        value={formData.systemPrompt || ""}
                                        onChange={(e: { target: { value: any } }) =>
                                            handleInputChange("systemPrompt", e.target.value)
                                        }
                                        placeholder="Your system prompt"
                                        rows={4}
                                    />
                                </FormGroup>
                            </>
                        )}
                        {activeTab === "help" && <HelpTab nodeType="AiAgent" />}
                    </TabContentFunction>
                </PanelContent>
            </>
        );
    };

    const renderIotDBTabs = () => {
        const tabs = [
            { id: "settings", label: "Settings" },
            { id: "sql_query", label: "SQL Query" },
            { id: "help", label: "Help" },
        ];

        return (
            <>
                <TabsContainer>
                    {tabs
                        .filter(
                            (tab) =>
                                !(
                                    tab.id === "sql_query" &&
                                    (formData.action === "Insert" || formData.queryMode === "query_from_payload")
                                ),
                        )
                        .map((tab) => (
                            <Tab key={tab.id} isActive={activeTab === tab.id} onClick={() => setActiveTab(tab.id)}>
                                {tab.label}
                            </Tab>
                        ))}
                </TabsContainer>
                <PanelContent>
                    <TabContentFunction>
                        {activeTab === "settings" && (
                            <>
                                <FormGroup>
                                    <Label>Node Name</Label>
                                    <Input
                                        type="text"
                                        value={formData.label || ""}
                                        onChange={(e: { target: { value: any } }) =>
                                            handleInputChange("label", e.target.value)
                                        }
                                        placeholder="Node name"
                                    />
                                </FormGroup>
                                {renderOutputSelector()}
                                <FormGroup>
                                    <Label>Query mode</Label>
                                    <Select
                                        value={formData.queryMode || "static_query"}
                                        onChange={(e: { target: { value: any } }) => {
                                            handleInputChange("queryMode", e.target.value);
                                        }}
                                    >
                                        <option value="static_query">Static query</option>
                                        <option value="query_from_payload">Query from msg.payload.sql</option>
                                    </Select>
                                </FormGroup>
                                {formData.queryMode === "static_query" && (
                                    <>
                                        <FormGroup>
                                            <Label>Action</Label>
                                            <Select
                                                value={formData.action || "Insert"}
                                                onChange={(e: { target: { value: any } }) => {
                                                    handleInputChange("action", e.target.value);
                                                }}
                                            >
                                                <option value="Insert">Insert</option>
                                                <option value="Read">Read</option>
                                            </Select>
                                        </FormGroup>
                                        {formData.action === "Insert" && (
                                            <FormGroup>
                                                <Label>Topic</Label>
                                                <Select
                                                    value={formData.insertTopicRef ?? ""}
                                                    onChange={(e: { target: { value: any } }) =>
                                                        handleInputChange("insertTopicRef", e.target.value)
                                                    }
                                                >
                                                    {dev2pdbTopicsRef.map((topic) => (
                                                        <option key={topic} value={topic}>
                                                            {topic}
                                                        </option>
                                                    ))}
                                                </Select>
                                            </FormGroup>
                                        )}
                                    </>
                                )}
                            </>
                        )}
                        {activeTab === "sql_query" &&
                            formData.queryMode === "static_query" &&
                            formData.action === "Read" && (
                                <FormGroup>
                                    <CodeMirrorWrapper>
                                        <CodeMirror
                                            value={
                                                formData.sqlQuery ||
                                                "SELECT * FROM iot_table \nWHERE topic = $__topicFun('dev2pdb_1') \nAND timestamp >= $__timeFun('now-25s') \nAND timestamp <= $__timeFun('now') \nORDER BY timestamp DESC;"
                                            }
                                            height="auto"
                                            minHeight="500px"
                                            extensions={codeMirrorSqlExtensions}
                                            theme={oneDark}
                                            onChange={(value) => handleInputChange("sqlQuery", value)}
                                            basicSetup={{
                                                lineNumbers: true,
                                                foldGutter: true,
                                                bracketMatching: true,
                                                closeBrackets: true,
                                                syntaxHighlighting: true,
                                                autocompletion: true,
                                                tabSize: 4,
                                                searchKeymap: true,
                                            }}
                                        />
                                    </CodeMirrorWrapper>
                                </FormGroup>
                            )}
                        {activeTab === "help" && <HelpTab nodeType="IoTDb" />}
                    </TabContentFunction>
                </PanelContent>
            </>
        );
    };

    const renderS3StorageTabs = () => {
        const tabs = [
            { id: "settings", label: "Settings" },
            { id: "duckdb_query", label: "DuckDB query" },
            { id: "help", label: "Help" },
        ];

        return (
            <>
                <TabsContainer>
                    {tabs
                        .filter(
                            (tab) =>
                                !(
                                    tab.id === "duckdb_query" &&
                                    (formData.action === "Insert" || formData.queryMode === "query_from_payload")
                                ),
                        )
                        .map((tab) => (
                            <Tab key={tab.id} isActive={activeTab === tab.id} onClick={() => setActiveTab(tab.id)}>
                                {tab.label}
                            </Tab>
                        ))}
                </TabsContainer>
                <PanelContent>
                    <TabContentFunction>
                        {activeTab === "settings" && (
                            <>
                                <FormGroup>
                                    <Label>Node Name</Label>
                                    <Input
                                        type="text"
                                        value={formData.label || ""}
                                        onChange={(e: { target: { value: any } }) =>
                                            handleInputChange("label", e.target.value)
                                        }
                                        placeholder="Node name"
                                    />
                                </FormGroup>
                                {renderOutputSelector()}
                                <FormGroup>
                                    <Label>Query mode</Label>
                                    <Select
                                        value={formData.queryMode || "static_query"}
                                        onChange={(e: { target: { value: any } }) => {
                                            handleInputChange("queryMode", e.target.value);
                                        }}
                                    >
                                        <option value="static_query">Static query</option>
                                        <option value="query_from_payload">Query from msg.payload.s3Storage</option>
                                    </Select>
                                </FormGroup>
                                {formData.queryMode === "static_query" && (
                                    <>
                                        <FormGroup>
                                            <Label>Action</Label>
                                            <Select
                                                value={formData.action || "Insert"}
                                                onChange={(e: { target: { value: any } }) => {
                                                    handleInputChange("action", e.target.value);
                                                }}
                                            >
                                                <option value="Insert">Insert</option>
                                                <option value="Read">Read</option>
                                            </Select>
                                        </FormGroup>
                                        {formData.action === "Insert" && (
                                            <FormGroup>
                                                <Label>Folder name</Label>
                                                <Select
                                                    value={formData.folderName ?? ""}
                                                    onChange={(e: { target: { value: any } }) =>
                                                        handleInputChange("folderName", e.target.value)
                                                    }
                                                >
                                                    {assetS3Folders.map((assetS3Folder) => (
                                                        <option
                                                            key={assetS3Folder.folderName}
                                                            value={assetS3Folder.folderName}
                                                        >
                                                            {assetS3Folder.folderName}
                                                        </option>
                                                    ))}
                                                </Select>
                                            </FormGroup>
                                        )}
                                    </>
                                )}
                            </>
                        )}
                        {activeTab === "duckdb_query" &&
                            formData.queryMode === "static_query" &&
                            formData.action === "Read" && (
                                <FormGroup>
                                    <CodeMirrorWrapper>
                                        <CodeMirror
                                            value={
                                                formData.duckdbQuery ||
                                                "SELECT * FROM s3_storage('folder_1') WHERE timestamp >= $__timeFun('now-1d/d') AND timestamp <= $__timeFun('now/d') ORDER BY timestamp DESC;"
                                            }
                                            height="auto"
                                            minHeight="500px"
                                            extensions={codeMirrorSqlExtensions}
                                            theme={oneDark}
                                            onChange={(value) => handleInputChange("duckdbQuery", value)}
                                            basicSetup={{
                                                lineNumbers: true,
                                                foldGutter: true,
                                                bracketMatching: true,
                                                closeBrackets: true,
                                                syntaxHighlighting: true,
                                                autocompletion: true,
                                                tabSize: 4,
                                                searchKeymap: true,
                                            }}
                                        />
                                    </CodeMirrorWrapper>
                                </FormGroup>
                            )}
                        {activeTab === "help" && <HelpTab nodeType="S3Storage" />}
                    </TabContentFunction>
                </PanelContent>
            </>
        );
    };

    const renderAssetStateTabs = () => {
        const tabs = [
            { id: "settings", label: "Settings" },
            { id: "json", label: "JSON" },
            { id: "help", label: "Help" },
        ];

        return (
            <>
                <TabsContainer>
                    {tabs
                        .filter(
                            (tab) =>
                                !(
                                    tab.id === "json" &&
                                    (formData.setStateMode === "state_from_payload" ||
                                        formData.action === "Get state of current asset" ||
                                        formData.action === "Get states of assets in current group")
                                ),
                        )
                        .map((tab) => (
                            <Tab key={tab.id} isActive={activeTab === tab.id} onClick={() => setActiveTab(tab.id)}>
                                {tab.label}
                            </Tab>
                        ))}
                </TabsContainer>
                <PanelContent>
                    <TabContentFunction>
                        {activeTab === "settings" && (
                            <>
                                <FormGroup>
                                    <Label>Node Name</Label>
                                    <Input
                                        type="text"
                                        value={formData.label || ""}
                                        onChange={(e: { target: { value: any } }) =>
                                            handleInputChange("label", e.target.value)
                                        }
                                        placeholder="Node name"
                                    />
                                </FormGroup>
                                {renderOutputSelector()}
                                <FormGroup>
                                    <Label>Store type</Label>
                                    <Select
                                        value={formData.storeType || "IoTDB"}
                                        onChange={(e: { target: { value: any } }) => {
                                            handleInputChange("storeType", e.target.value);
                                        }}
                                    >
                                        <option value="IoTDB">IoT DB</option>
                                        <option value="key_value_store">Key-Value Store</option>
                                    </Select>
                                </FormGroup>
                                <FormGroup>
                                    <Label>Action</Label>
                                    <Select
                                        value={formData.action || "Set or update state of current asset"}
                                        onChange={(e: { target: { value: any } }) => {
                                            handleInputChange("action", e.target.value);
                                        }}
                                    >
                                        <option value="Set or update state of current asset">
                                            Set or update state of current asset
                                        </option>
                                        <option value="Get state of current asset">Get state of current asset</option>
                                        <option value="Get states of assets in current group">
                                            Get states of assets in current group
                                        </option>
                                    </Select>
                                </FormGroup>
                                {formData.action === "Set or update state of current asset" && (
                                    <FormGroup>
                                        <Label>Set state mode</Label>
                                        <Select
                                            value={formData.setStateMode || "custom_state"}
                                            onChange={(e: { target: { value: any } }) => {
                                                handleInputChange("setStateMode", e.target.value);
                                            }}
                                        >
                                            <option value="custom_state">Custom state</option>
                                            <option value="state_from_payload">State from msg.payload.state</option>
                                        </Select>
                                    </FormGroup>
                                )}
                            </>
                        )}
                        {activeTab === "json" &&
                            formData.setStateMode === "custom_state" &&
                            formData.action === "Set or update state of current asset" && (
                                <FormGroup>
                                    <CodeMirrorWrapper>
                                        <CodeMirror
                                            value={formData.customState || '{\n    "status": "OK"\n}'}
                                            height="auto"
                                            minHeight="350px"
                                            extensions={[
                                                json(),
                                                indentUnit.of("    "),
                                                indentOnInput(),
                                                keymap.of([...completionKeymap, indentWithTab, ReIndentCommand]),
                                            ]}
                                            theme={oneDark}
                                            onChange={(value) => handleInputChange("customState", value)}
                                            basicSetup={{
                                                lineNumbers: true,
                                                foldGutter: true,
                                                bracketMatching: true,
                                                closeBrackets: true,
                                                syntaxHighlighting: true,
                                                autocompletion: true,
                                                tabSize: 4,
                                                searchKeymap: true,
                                            }}
                                        />
                                    </CodeMirrorWrapper>
                                </FormGroup>
                            )}
                        {activeTab === "help" && <HelpTab nodeType="AssetState" />}
                    </TabContentFunction>
                </PanelContent>
            </>
        );
    };

    // Renderizado de formularios según el tipo de nodo (sin colapsables)
    const renderNodeContent = () => {
        if (!selectedNode) return null;

        const nodeType = selectedNode.type;

        if (nodeType === "Function") {
            return renderFunctionTabs();
        } else if (nodeType === "Comment") {
            return null;
        } else if (nodeType === "Inject") {
            return renderInjectTabs();
        } else if (nodeType === "Trigger") {
            return renderTriggerProperties();
        } else if (nodeType === "AiAgent") {
            return renderAiAgentTabs();
        } else if (nodeType === "IoTDb") {
            return renderIotDBTabs();
        } else if (nodeType === "S3Storage") {
            return renderS3StorageTabs();
        } else if (nodeType === "AssetState") {
            return renderAssetStateTabs();
        }

        // Para otros tipos de nodos, mostrar contenido simple
        return (
            <>
                <TabsContainer>
                    <Tab isActive={activeTab === "settings"} onClick={() => setActiveTab("settings")}>
                        Settings
                    </Tab>
                    <Tab isActive={activeTab === "help"} onClick={() => setActiveTab("help")}>
                        Help
                    </Tab>
                </TabsContainer>
                <PanelContent>
                    <TabContent>
                        {activeTab === "settings" && (
                            <>
                                <FormGroup>
                                    <Label>Node Name</Label>
                                    <Input
                                        type="text"
                                        value={formData.label || ""}
                                        onChange={(e: { target: { value: any } }) =>
                                            handleInputChange("label", e.target.value)
                                        }
                                        placeholder="Node name"
                                    />
                                </FormGroup>
                                {renderOutputSelector()}
                                {renderNodeSpecificFields()}
                            </>
                        )}
                        {activeTab === "help" && <HelpTab nodeType={nodeType} />}
                    </TabContent>
                </PanelContent>
            </>
        );
    };

    const renderNodeSpecificFields = () => {
        if (!selectedNode) return null;

        const nodeType = selectedNode.type;

        switch (nodeType) {
            case "Listen":
                return (
                    <>
                        <FormGroup>
                            <Label>Listen To</Label>
                            <Select
                                value={formData.listenTo || "Topic reference"}
                                onChange={(e: { target: { value: any } }) =>
                                    handleInputChange("listenTo", e.target.value)
                                }
                            >
                                <option value="Topic reference">Topic reference</option>
                                <option value="Generic nats">Generic nats</option>
                                <option value="Generic mqtt">Generic mqtt</option>
                            </Select>
                        </FormGroup>
                        <FormGroup>
                            <Label>Topic</Label>
                            {formData.listenTo === "Topic reference" ? (
                                <Select
                                    value={formData.topic ?? ""}
                                    onChange={(e: { target: { value: any } }) => 
                                        handleInputChange("topic", e.target.value)
                                    }
                                >
                                    {dev2pdbTopicsRef.length > 0 && (
                                        <>
                                            <optgroup label="Subscribe to all dev2pdb topics">
                                                <option key="all dev2pdb" value="all_dev2pdb">
                                                    all dev2pdb
                                                </option>
                                            </optgroup>
                                            <optgroup label="Select single dev2pdb topic">
                                                {dev2pdbTopicsRef.map((topic) => (
                                                    <option key={topic} value={topic}>
                                                        {topic}
                                                    </option>
                                                ))}
                                            </optgroup>
                                        </>
                                    )}
                                    {listenTopicsRef.length > 0 && (
                                        <optgroup label="Select custom listen topics">
                                            {listenTopicsRef.map((topic) => (
                                                <option key={topic} value={topic}>
                                                    {topic}
                                                </option>
                                            ))}
                                        </optgroup>
                                    )}
                                    {systemMonitoringTopicsRef.length > 0 && (
                                        <optgroup label="Select system monitoring topics">
                                            {systemMonitoringTopicsRef.map((topic) => (
                                                <option key={topic.topicRef} value={topic.topicRef}>
                                                    {topic.description}
                                                </option>
                                            ))}
                                        </optgroup>
                                    )}
                                </Select>
                            ) : (
                                <Input
                                    type="text"
                                    value={
                                        listenTopicsRef.includes(formData.topic) ? "your_topic" : (formData.topic ?? "")
                                    }
                                    onChange={(e: { target: { value: any } }) =>
                                        handleInputChange("topic", e.target.value)
                                    }
                                    placeholder="your_topic"
                                />
                            )}
                        </FormGroup>
                    </>
                );

            case "Publish":
                return (
                    <>
                        <FormGroup>
                            <Label>Publish To</Label>
                            <Select
                                value={formData.publishTo || "Topic reference"}
                                onChange={(e: { target: { value: string } }) => {
                                    handleInputChange("publishTo", e.target.value);
                                    if (e.target.value === "Topic reference") {
                                        handleInputChange("topic", "dtm2sim");
                                    }
                                }}
                            >
                                <option value="Topic reference">Topic reference</option>
                                <option value="Generic nats">Generic nats</option>
                                <option value="Generic mqtt">Generic mqtt</option>
                                <option value="Reply">Reply</option>
                            </Select>
                        </FormGroup>
                        {formData.publishTo === "Topic reference" && (
                            <FormGroup>
                                <Label>Topic</Label>
                                <Select
                                    value={formData.topic ?? ""}
                                    onChange={(e: { target: { value: any } }) =>
                                        handleInputChange("topic", e.target.value)
                                    }
                                >
                                    {publishTopicsRef.map((topic) => (
                                        <option key={topic} value={topic}>
                                            {topic}
                                        </option>
                                    ))}
                                </Select>
                            </FormGroup>
                        )}
                        {(formData.publishTo === "Generic nats" || formData.publishTo === "Generic mqtt") && (
                            <FormGroup>
                                <Label>Topic</Label>
                                <Input
                                    type="text"
                                    value={
                                        publishTopicsRef.includes(formData.topic)
                                            ? "your_topic"
                                            : (formData.topic ?? "")
                                    }
                                    onChange={(e: { target: { value: any } }) =>
                                        handleInputChange("topic", e.target.value)
                                    }
                                    placeholder="your_topic"
                                />
                            </FormGroup>
                        )}
                    </>
                );
            case "Delay":
                return (
                    <FormGroup>
                        <Label>Duration (seconds)</Label>
                        <Input
                            type="number"
                            step="0.1"
                            value={formData.duration || 0}
                            onChange={(e: { target: { value: string } }) =>
                                handleInputChange("duration", Math.max(0, parseFloat(e.target.value)))
                            }
                            placeholder="0.0"
                        />
                    </FormGroup>
                );
            case "Transcriptor":
                return (
                    <>
                        <FormGroup>
                            <Label>Language</Label>
                            <Select
                                value={formData.language || "en"}
                                onChange={(e: { target: { value: any } }) =>
                                    handleInputChange("language", e.target.value)
                                }
                            >
                                <option value="en">English</option>
                                <option value="es">Spanish</option>
                                <option value="fr">French</option>
                                <option value="de">German</option>
                                <option value="it">Italian</option>
                                <option value="pt">Portuguese</option>
                                <option value="ca">Catalan</option>
                            </Select>
                        </FormGroup>
                    </>
                );
            case "Translator":
                return (
                    <>
                        <FormGroup>
                            <Label>Target language</Label>
                            <Select
                                value={formData.targetLanguage || "en"}
                                onChange={(e: { target: { value: any } }) =>
                                    handleInputChange("targetLanguage", e.target.value)
                                }
                            >
                                <option value="en">English</option>
                                <option value="es">Spanish</option>
                                <option value="fr">French</option>
                                <option value="de">German</option>
                                <option value="it">Italian</option>
                                <option value="pt">Portuguese</option>
                                <option value="ca">Catalan</option>
                            </Select>
                        </FormGroup>
                        <FormGroup>
                            <Label>LLM Model</Label>
                            <Select
                                value={formData.llmModel || "openai:gpt-4o-mini"}
                                onChange={(e: { target: { value: any } }) =>
                                    handleInputChange("llmModel", e.target.value)
                                }
                            >
                                <option value="openai:gpt-oss-120b">openai:gpt-oss-120b</option>
                                <option value="openai:gpt-oss-20b">openai:gpt-oss-20b</option>
                                <option value="openai:gpt-4o">openai:gpt-4o</option>
                                <option value="openai:gpt-4o-mini">openai:gpt-4o-mini</option>
                                <option value="openai:gpt-5-mini">openai:gpt-5-mini</option>
                                <option value="openai:gpt-5-nano">openai:gpt-5-nano</option>
                            </Select>
                        </FormGroup>
                    </>
                );

            case "Text2Speech":
                return (
                    <>
                        <FormGroup>
                            <Label>TTS mode</Label>
                            <Select
                                value={formData.ttsMode || "edge-tts"}
                                onChange={(e: { target: { value: any } }) =>
                                    handleInputChange("ttsMode", e.target.value)
                                }
                            >
                                <option value="edge-tts">Microsoft Edge's text-to-speech service</option>
                                <option value="openai-tts">OpenAI's text-to-speech service</option>
                            </Select>
                        </FormGroup>
                        {formData.ttsMode === "edge-tts" && (
                            <>
                                <FormGroup>
                                    <Label>Voice language</Label>
                                    <Select
                                        value={formData.voiceLanguage || "en"}
                                        onChange={(e: { target: { value: any } }) =>
                                            handleInputChange("voiceLanguage", e.target.value)
                                        }
                                    >
                                        <option value="en">English</option>
                                        <option value="es">Spanish</option>
                                        <option value="fr">French</option>
                                        <option value="de">German</option>
                                        <option value="it">Italian</option>
                                        <option value="pt">Portuguese</option>
                                        <option value="ca">Catalan</option>
                                    </Select>
                                </FormGroup>
                                <FormGroup>
                                    <Label>Voice gender</Label>
                                    <Select
                                        value={formData.voiceGender || "female"}
                                        onChange={(e: { target: { value: any } }) =>
                                            handleInputChange("voiceGender", e.target.value)
                                        }
                                    >
                                        <option value="female">Female</option>
                                        <option value="male">Male</option>
                                    </Select>
                                </FormGroup>
                            </>
                        )}
                    </>
                );

            case "Splitter":
                return (
                    <>
                        <FormGroup>
                            <Label>Node Name</Label>
                            <Input
                                type="text"
                                value={formData.label || ""}
                                onChange={(e: { target: { value: any } }) => handleInputChange("label", e.target.value)}
                                placeholder="Node name"
                            />
                        </FormGroup>
                        <FormGroup>
                            <Label>
                                Weights{" "}
                                <span style={{ color: "#9ca3af", fontWeight: 400 }}>
                                    (one per output, e.g. 1 4 → output 0 every 1 in 5, output 1 every 4 in 5)
                                </span>
                            </Label>
                            {(formData.weights || [1, 1]).map((w: number, idx: number) => (
                                <div
                                    key={idx}
                                    style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}
                                >
                                    <span style={{ color: "#9ca3af", minWidth: "64px", fontSize: "12px" }}>
                                        Output {idx}
                                    </span>
                                    <Input
                                        type="number"
                                        step="1"
                                        min="1"
                                        value={w}
                                        onChange={(e: { target: { value: string } }) => {
                                            const newWeights = [...(formData.weights || [1, 1])];
                                            newWeights[idx] = Math.max(1, parseInt(e.target.value) || 1);
                                            handleInputChange("weights", newWeights);
                                            handleInputChange("numOutputs", newWeights.length);
                                        }}
                                    />
                                    <Button
                                        variant="secondary"
                                        onClick={() => {
                                            const newWeights = (formData.weights || [1, 1]).filter(
                                                (_: number, i: number) => i !== idx,
                                            );
                                            if (newWeights.length >= 1) {
                                                handleInputChange("weights", newWeights);
                                                handleInputChange("numOutputs", newWeights.length);
                                            }
                                        }}
                                        style={{ padding: "4px 8px", minWidth: "32px" }}
                                    >
                                        −
                                    </Button>
                                </div>
                            ))}
                            <Button
                                variant="secondary"
                                onClick={() => {
                                    const newWeights = [...(formData.weights || [1, 1]), 1];
                                    handleInputChange("weights", newWeights);
                                    handleInputChange("numOutputs", newWeights.length);
                                }}
                                style={{ marginTop: "4px" }}
                            >
                                + Add output
                            </Button>
                        </FormGroup>
                    </>
                );

            case "MlModel":
                return (
                    <>
                        <FormGroup>
                            <Label>Machine learning model</Label>
                            <Select
                                value={formData.mlModelId ?? ""}
                                onChange={(e: { target: { value: string } }) =>
                                    handleInputChange("mlModelId", parseInt(e.target.value))
                                }
                            >
                                {mlModelsTable.map((model) => (
                                    <option key={model.id} value={model.id}>
                                        {model.description}
                                    </option>
                                ))}
                            </Select>
                        </FormGroup>
                        <FormGroup>
                            <Label>Batch size</Label>
                            <Input
                                type="number"
                                value={formData.batchSize ?? 1}
                                onChange={(e: { target: { value: string } }) =>
                                    handleInputChange("batchSize", parseInt(e.target.value))
                                }
                                placeholder="1"
                            />
                        </FormGroup>
                    </>
                );

            case "Email":
                return (
                    <>
                        <FormGroup>
                            <Label>To Options</Label>
                            <Select
                                value={formData.toOptions || "Group email notification channel"}
                                onChange={(e: { target: { value: any } }) =>
                                    handleInputChange("toOptions", e.target.value)
                                }
                            >
                                <option value="Group email notification channel">
                                    Group email notification channel
                                </option>
                                <option value="Custom email">Custom email</option>
                            </Select>
                        </FormGroup>
                        {formData.toOptions === "Custom email" && (
                            <FormGroup>
                                <Label>Email Address</Label>
                                <Input
                                    type="email"
                                    value={formData.to || ""}
                                    onChange={(e: { target: { value: any } }) =>
                                        handleInputChange("to", e.target.value)
                                    }
                                    placeholder="myemail@example.com"
                                />
                            </FormGroup>
                        )}
                        <FormGroup>
                            <Label>Message Options</Label>
                            <Select
                                value={formData.messageOptions || "Use subject and body from incoming message"}
                                onChange={(e: { target: { value: any } }) =>
                                    handleInputChange("messageOptions", e.target.value)
                                }
                            >
                                <option value="Use subject and body from incoming message">
                                    Use subject and body from incoming message
                                </option>
                                <option value="Custom message">Custom message</option>
                            </Select>
                        </FormGroup>
                        {formData.messageOptions === "Custom message" && (
                            <>
                                <FormGroup>
                                    <Label>Subject</Label>
                                    <Input
                                        type="text"
                                        value={formData.subject || ""}
                                        onChange={(e: { target: { value: any } }) =>
                                            handleInputChange("subject", e.target.value)
                                        }
                                        placeholder="Email Subject"
                                    />
                                </FormGroup>
                                <FormGroup>
                                    <Label>Body</Label>
                                    <TextArea
                                        value={formData.body || ""}
                                        onChange={(e: { target: { value: any } }) =>
                                            handleInputChange("body", e.target.value)
                                        }
                                        placeholder="Email Body"
                                        rows={4}
                                    />
                                </FormGroup>
                            </>
                        )}
                    </>
                );

            case "TelegramListen":
                return (
                    <>
                        <FormGroup>
                            <Label>Chat ID</Label>
                            <Input
                                type="text"
                                value={formData.chatId || ""}
                                onChange={(e: { target: { value: any } }) =>
                                    handleInputChange("chatId", e.target.value)
                                }
                                placeholder="123456789"
                            />
                        </FormGroup>
                    </>
                );
            case "TelegramSend":
                return (
                    <>
                        <FormGroup>
                            <Label>Chat ID</Label>
                            <Input
                                type="text"
                                value={formData.chatId || ""}
                                onChange={(e: { target: { value: any } }) =>
                                    handleInputChange("chatId", e.target.value)
                                }
                                placeholder="123456789"
                            />
                        </FormGroup>
                        <FormGroup>
                            <Label>Message Options</Label>
                            <Select
                                value={formData.messageOptions || "Use message from incoming payload"}
                                onChange={(e: { target: { value: any } }) =>
                                    handleInputChange("messageOptions", e.target.value)
                                }
                            >
                                <option value="Use message from incoming payload">
                                    Use message from incoming payload
                                </option>
                                <option value="Custom message">Custom message</option>
                            </Select>
                        </FormGroup>
                        {formData.messageOptions === "Custom message" && (
                            <FormGroup>
                                <Label>Message</Label>
                                <TextArea
                                    value={formData.messageToSend || ""}
                                    onChange={(e: { target: { value: any } }) =>
                                        handleInputChange("messageToSend", e.target.value)
                                    }
                                    placeholder="Hello from OSI4IOT!"
                                    rows={4}
                                />
                            </FormGroup>
                        )}
                    </>
                );
            case "Batch":
                return (
                    <>
                        <FormGroup>
                            <Label>Mode</Label>
                            <Select
                                value={formData.batchMode || "Group by number of messages"}
                                onChange={(e: { target: { value: any } }) =>
                                    handleInputChange("batchMode", e.target.value)
                                }
                            >
                                <option value="Group by number of messages">Group by number of messages</option>
                                <option value="Group by time interval">Group by time interval</option>
                            </Select>
                        </FormGroup>
                        {formData.batchMode === "Group by number of messages" && (
                            <FormGroup>
                                <Label>Number of messages</Label>
                                <Input
                                    type="number"
                                    step="1"
                                    value={formData.batchSize || 1}
                                    onChange={(e: { target: { value: string } }) =>
                                        handleInputChange("batchSize", Math.max(1, parseInt(e.target.value)))
                                    }
                                    placeholder="1"
                                />
                            </FormGroup>
                        )}
                        {formData.batchMode === "Group by time interval" && (
                            <FormGroup>
                                <Label>Time interval (seconds)</Label>
                                <Input
                                    type="number"
                                    step="1"
                                    value={formData.batchInterval || 1}
                                    onChange={(e: { target: { value: string } }) =>
                                        handleInputChange("batchInterval", Math.max(1, parseInt(e.target.value)))
                                    }
                                    placeholder="1"
                                />
                            </FormGroup>
                        )}
                    </>
                );

            default:
                return <p style={{ color: "#9ca3af" }}>No additional settings available for this node type.</p>;
        }
    };

    if (!isOpen) return null;

    return (
        <PanelContainer ref={panelRef} isOpen={isOpen} isClosing={isClosing}>
            <ResizeHandle isDragging={isDragging} onMouseDown={startDrag} />
            {selectedNode && (
                <>
                    <PanelHeader>
                        <PanelTitle>
                            <NodeTypeIndicator nodeType={selectedNode.type}>{selectedNode.type}</NodeTypeIndicator>
                            Node Uid: {selectedNode.data.nodeUid}
                        </PanelTitle>
                        <HeaderControls>
                            <DebugToggle isActive={isDebugEnabled} onClick={handleDebugToggle}>
                                <Bug size={14} />
                                {isDebugEnabled ? "Debug ON" : "Debug OFF"}
                            </DebugToggle>
                            <CloseButton onClick={handleClose}>
                                <X size={16} />
                            </CloseButton>
                        </HeaderControls>
                    </PanelHeader>

                    {renderNodeContent()}

                    <ButtonGroup>
                        <Button variant="secondary" onClick={handleReset}>
                            <RotateCcw size={16} />
                            Reset
                        </Button>
                        <Button variant="primary" onClick={handleSave}>
                            <Save size={16} />
                            Save
                        </Button>
                    </ButtonGroup>
                </>
            )}
        </PanelContainer>
    );
};

export default NodePropertiesPanel;
