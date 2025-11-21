import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import styled, { keyframes, css } from "styled-components";
import { X, Save, RotateCcw, Bug } from "lucide-react";
import { indentUnit, indentOnInput } from "@codemirror/language";
import { completionKeymap } from "@codemirror/autocomplete";
import { indentWithTab } from "@codemirror/commands";

// Importaciones de CodeMirror
import CodeMirror, { keymap, hoverTooltip } from "@uiw/react-codemirror";
import { javascript, javascriptLanguage } from "@codemirror/lang-javascript";
import { oneDark } from "@codemirror/theme-one-dark";
import { useUpdateNodeInternals } from "@xyflow/react";
import { useFormChanges } from "../Utils/customHooks";
import { IMqttTopicData } from "../Main/Model";
import GeneralizedCompletion from "./Completion/Completion";
import { json } from "@codemirror/lang-json";
import { IDigitalTwin } from "../../TableColumns/digitalTwinsColumns";
import { useMlModelsTableInGroup } from "../../../../contexts/platformAssistantContext/platformAssistantContext";
import { TimeSelector } from "./Utils/TimeSelector";
import { timezoneOptions } from "./Utils/timezones";
import { GetVariableInfo } from "./Completion/tools";

// CSS estándar para el resizing - mejor performance
const resizableStyles = `
  .resizable-panel {
    width: var(--panel-width, 550px);
    transition: none;
  }
  
  .resizable-panel.dragging {
    transition: none !important;
    user-select: none;
  }
  
  .resizable-panel:not(.dragging) {
    transition: width 0.2s ease;
  }
`;

// Inyectar estilos una sola vez
if (typeof document !== "undefined" && !document.getElementById("resizable-panel-styles")) {
    const styleSheet = document.createElement("style");
    styleSheet.id = "resizable-panel-styles";
    styleSheet.textContent = resizableStyles;
    document.head.appendChild(styleSheet);
}

// Animaciones
const slideIn = keyframes`
  from {
    transform: translateX(-100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
`;

const slideOut = keyframes`
  from {
    transform: translateX(0);
    opacity: 1;
  }
  to {
    transform: translateX(-100%);
    opacity: 0;
  }
`;

const reIndentCode = (code: string): string => {
    const lines = code.split("\n");
    let indentLevel = 0;
    const indentSize = 4;

    return lines
        .map((line) => {
            const trimmed = line.trim();

            // Si hay contenido en la línea
            if (trimmed.length > 0) {
                // Reducir indentación antes de procesar closing brackets
                if (
                    trimmed.startsWith("}") ||
                    trimmed.startsWith("]") ||
                    trimmed.startsWith(")") ||
                    trimmed.includes("} else") ||
                    trimmed.includes("} catch") ||
                    trimmed.includes("} finally")
                ) {
                    indentLevel = Math.max(0, indentLevel - 1);
                }

                const indented = " ".repeat(indentLevel * indentSize) + trimmed;

                // Aumentar indentación después de opening brackets
                if (
                    trimmed.endsWith("{") ||
                    trimmed.endsWith("[") ||
                    trimmed.endsWith("(") ||
                    (trimmed.includes("{") && !trimmed.includes("}"))
                ) {
                    indentLevel++;
                }

                return indented;
            }

            // Líneas vacías se mantienen vacías
            return "";
        })
        .join("\n");
};

// Comando para re-indentar
const reIndentCommand = {
    key: "Ctrl-Shift-i",
    run: (view: any) => {
        const code = view.state.doc.toString();
        const formatted = reIndentCode(code);

        view.dispatch({
            changes: {
                from: 0,
                to: view.state.doc.length,
                insert: formatted,
            },
        });
        return true;
    },
};

const PanelContainer = styled.div.attrs<{ isOpen: boolean; isClosing: boolean }>((props) => ({
    style: {
        transform: `translateX(${props.isOpen ? "0" : "-100%"})`,
        opacity: props.isOpen ? "1" : "0",
    },
    className: "resizable-panel",
}))<{ isOpen: boolean; isClosing: boolean }>`
    position: fixed;
    left: 220px;
    top: 202px;
    height: calc(100vh - 219px);
    background-color: #2a2a2a;
    border-right: 1px solid #444;
    box-shadow: 2px 0 10px rgba(0, 0, 0, 0.3);
    z-index: 1001;
    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease;
    display: flex;
    flex-direction: column;

    ${(props) =>
        props.isClosing &&
        css`
            animation: ${slideOut} 0.3s ease-out forwards;
        `}

    ${(props) =>
        props.isOpen &&
        !props.isClosing &&
        css`
            animation: ${slideIn} 0.3s ease-out forwards;
        `}
`;

// ResizeHandle sin estilos dinámicos
const ResizeHandle = styled.div<{ isDragging: boolean }>`
    position: absolute;
    top: 0;
    right: 0;
    width: 8px;
    height: 100%;
    cursor: ew-resize;
    background: ${(props) => (props.isDragging ? "rgba(59, 130, 246, 0.3)" : "transparent")};
    border-left: ${(props) => (props.isDragging ? "2px solid #3b82f6" : "2px solid transparent")};
    transition: all 0.2s ease;
    z-index: 10;

    &:hover {
        background: rgba(59, 130, 246, 0.2);
        border-left: 2px solid #3b82f6;
    }

    &::after {
        content: "";
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 3px;
        height: 40px;
        background: #6b7280;
        border-radius: 2px;
        opacity: ${(props) => (props.isDragging ? 1 : 0.6)};
        transition: opacity 0.2s ease;
    }

    &:hover::after {
        opacity: 1;
        background: #3b82f6;
    }
`;

const PanelHeader = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 20px;
    border-bottom: 1px solid #444;
`;

const PanelTitle = styled.h2`
    color: #e7e3df;
    font-size: 14px;
    font-weight: 600;
    margin: 0;
    display: flex;
    align-items: center;
    gap: 10px;
    font-family: Helvetica, Arial, sans-serif;
`;

const NodeTypeIndicator = styled.span<{ nodeType: string }>`
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 500;
    text-transform: uppercase;
    background-color: ${(props) => {
        switch (props.nodeType) {
            case "Function":
                return "#c4a07d";
            case "Listen":
                return "#aa97aa";
            case "Publish":
                return "#aa97aa";
            case "Inject":
                return "#a6bbcf";
            case "Delay":
                return "#a8a152";
            case "MlModel":
                return "#bd5f25ff";
            case "AiAgent":
                return "#B8B1FB";
            case "Email":
                return "#4a90e2";
            case "Telegram":
                return "#4a90e2";
            default:
                return "#6b7280";
        }
    }};
    color: #111827;
`;

const HeaderControls = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
`;

const DebugToggle = styled.button<{ isActive: boolean }>`
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border: none;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    background-color: ${(props) => (props.isActive ? "#16a34a" : "#374151")};
    color: ${(props) => (props.isActive ? "#ffffff" : "#d1d5db")};

    &:hover {
        background-color: ${(props) => (props.isActive ? "#15803d" : "#4b5563")};
    }

    &:active {
        background-color: ${(props) => (props.isActive ? "#166534" : "#6b7280")};
    }
`;

const CloseButton = styled.button`
    background: none;
    border: none;
    color: #9ca3af;
    cursor: pointer;
    padding: 4px;
    border-radius: 4px;
    transition: all 0.2s;

    &:hover {
        color: #f9fafb;
        background-color: #374151;
    }
`;

// Estilos para las pestañas
const TabsContainer = styled.div`
    display: flex;
    border-bottom: 1px solid #444;
    background-color: #2a2a2a;
`;

const Tab = styled.button<{ isActive: boolean }>`
    background: none;
    border: none;
    padding: 12px 16px;
    color: ${(props) => (props.isActive ? "#3b82f6" : "#9ca3af")};
    cursor: pointer;
    font-size: 16px;
    font-weight: 550;
    border-bottom: 2px solid ${(props) => (props.isActive ? "#3b82f6" : "transparent")};
    transition: all 0.2s;

    &:hover {
        color: ${(props) => (props.isActive ? "#3b82f6" : "#f9fafb")};
        background-color: #374151;
    }
`;

const PanelContent = styled.div`
    flex: 1;
    overflow-y: auto;
    background-color: #2a2a2a;

    &::-webkit-scrollbar {
        width: 8px;
    }

    &::-webkit-scrollbar-track {
        background: #2a2a2a;
    }

    &::-webkit-scrollbar-thumb {
        background: #4b5563;
        border-radius: 4px;
    }

    &::-webkit-scrollbar-thumb:hover {
        background: #6b7280;
    }
`;

const TabContent = styled.div`
    padding: 16px;
`;

const TabContentFunction = styled.div`
    padding: 16px 16px 0 16px;
`;

export const FormGroup = styled.div`
    margin-bottom: 16px;
`;

export const Label = styled.label`
    display: block;
    color: #d1d5db;
    font-size: 14px;
    font-weight: 500;
    margin-bottom: 6px;
`;

const Input = styled.input`
    width: 100%;
    padding: 10px 12px;
    background-color: #374151;
    border: 1px solid #4b5563;
    border-radius: 6px;
    color: #f9fafb;
    font-size: 14px;
    transition: border-color 0.2s;

    &:focus {
        outline: none;
        border-color: #3b82f6;
        box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
    }

    &::placeholder {
        color: #9ca3af;
    }
`;

// Primero, agrega estos styled components adicionales
const CheckboxGroup = styled.div`
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: 8px;
    margin-top: 8px;
`;

const CheckboxItem = styled.label`
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    padding: 8px 12px;
    border-radius: 6px;
    background-color: #374151;
    border: 1px solid #4b5563;
    transition: all 0.2s;
    color: #d1d5db;
    font-size: 14px;
    font-weight: 400;

    &:hover {
        background-color: #4b5563;
        border-color: #6b7280;
    }

    &[data-checked="true"] {
        background-color: #1e40af;
        border-color: #3b82f6;
        color: #fff;
    }
`;

const CheckboxInput = styled.input`
    appearance: none;
    width: 16px;
    height: 16px;
    border: 2px solid #6b7280;
    border-radius: 3px;
    background-color: transparent;
    cursor: pointer;
    position: relative;
    transition: all 0.2s;

    &:checked {
        background-color: #3b82f6;
        border-color: #3b82f6;

        &::after {
            content: "✓";
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            color: white;
            font-size: 12px;
            font-weight: bold;
        }
    }

    &:focus {
        outline: none;
        box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.3);
    }
`;

const Select = styled.select`
    width: 100%;
    padding: 10px 12px;
    background-color: #374151;
    border: 1px solid #4b5563;
    border-radius: 6px;
    color: #f9fafb;
    font-size: 14px;
    transition: border-color 0.2s;

    &:focus {
        outline: none;
        border-color: #3b82f6;
        box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
    }

    overflow-y: auto;
    &::-webkit-scrollbar {
        width: 8px;
    }

    &::-webkit-scrollbar-track {
        background: #2a2a2a;
    }

    &::-webkit-scrollbar-thumb {
        background: #4b5563;
        border-radius: 4px;
    }

    &::-webkit-scrollbar-thumb:hover {
        background: #6b7280;
    }
`;

const TextArea = styled.textarea`
    width: 100%;
    padding: 10px 12px;
    background-color: #374151;
    border: 1px solid #4b5563;
    border-radius: 6px;
    color: #f9fafb;
    font-size: 14px;
    font-family: "Monaco", "Menlo", "Ubuntu Mono", monospace;
    transition: border-color 0.2s;
    resize: vertical;
    min-height: 100px;

    &:focus {
        outline: none;
        border-color: #3b82f6;
        box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
    }

    &::placeholder {
        color: #9ca3af;
    }
`;

const TextAreaSystemPrompt = styled.textarea`
    width: 100%;
    padding: 10px 12px;
    background-color: #374151;
    border: 1px solid #4b5563;
    border-radius: 6px;
    color: #f9fafb;
    font-size: 14px;
    font-family: "Monaco", "Menlo", "Ubuntu Mono", monospace;
    transition: border-color 0.2s;
    resize: vertical;
    min-height: calc(100vh - 440px);

    &:focus {
        outline: none;
        border-color: #3b82f6;
        box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
    }

    &::placeholder {
        color: #9ca3af;
    }
`;

const ButtonGroup = styled.div`
    display: flex;
    gap: 8px;
    padding: 16px 20px;
    border-bottom: 1px solid #444;
`;

const Button = styled.button<{ variant?: "primary" | "secondary" }>`
    flex: 1;
    padding: 10px 16px;
    border: none;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;

    ${(props) =>
        props.variant === "primary"
            ? `
    background-color: #3b82f6;
    color: white;
    
    &:hover {
      background-color: #2563eb;
    }
    
    &:active {
      background-color: #1d4ed8;
    }
  `
            : `
    background-color: #374151;
    color: #d1d5db;
    
    &:hover {
      background-color: #4b5563;
    }
    
    &:active {
      background-color: #6b7280;
    }
  `}
`;

const CodeMirrorWrapper = styled.div`
    .cm-editor {
        border: 1px solid #4b5563;
        border-radius: 6px;
        font-size: 16px;
        font-family: Arial, monospace;
    }

    .cm-scroller {
        overflow-x: auto;
        background-color: #2a2a2a;

        &::-webkit-scrollbar {
            width: 8px;
            height: 8px;
        }

        &::-webkit-scrollbar-track {
            background: #2a2a2a;
        }

        &::-webkit-scrollbar-thumb {
            background: #4b5563;
            border-radius: 4px;
        }

        &::-webkit-scrollbar-thumb:hover {
            background: #6b7280;
        }
    }

    .cm-focused {
        outline: none;
        border-color: #3b82f6;
        box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
    }

    /* === ESTILOS PARA EL DESPLEGABLE DE AUTOCOMPLETADO === */

    /* Contenedor principal del desplegable */
    .cm-tooltip-autocomplete {
        background: #1e1e1e !important;
        border: 1px solid #404040 !important;
        border-radius: 8px !important;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3) !important;
        backdrop-filter: blur(10px) !important;
        max-height: 300px !important;
        min-width: 350px !important;
        max-width: min(900px, 95vw) !important;
        font-family: "Consolas", "Monaco", "Courier New", monospace !important;
        font-size: 13px !important;
    }

    /* Lista de opciones */
    .cm-tooltip-autocomplete > ul {
        padding: 2px !important;
        margin: 0 !important;
        background: transparent !important;
        max-width: min(900px, 95vw) !important;
    }

    /* Cada opción individual */
    .cm-tooltip-autocomplete ul li {
        padding: 6px 12px !important;
        margin: 0 !important;
        border-radius: 4px !important;
        cursor: pointer !important;
        transition: all 0.15s ease !important;
        border-left: 3px solid transparent !important;
        display: flex !important;
        align-items: center !important;
        gap: 6px !important;
    }

    /* Opción normal (no seleccionada) */
    .cm-tooltip-autocomplete ul li:not([aria-selected="true"]) {
        background: transparent !important;
        color: #d4d4d4 !important;
    }

    /* Opción seleccionada - MÁXIMO CONTRASTE */
    .cm-tooltip-autocomplete ul li[aria-selected="true"] {
        background: #0066cc !important;
        color: #ffffff !important;
        border-left-color: #ffffff !important;
        transform: translateX(3px) !important;
        box-shadow: 0 2px 8px rgba(0, 102, 204, 0.4) !important;
    }

    /* Hover - CONTRASTE MEDIO */
    .cm-tooltip-autocomplete ul li:hover:not([aria-selected="true"]) {
        background: #333333 !important;
        color: #ffffff !important;
        border-left-color: #666666 !important;
        transform: translateX(1px) !important;
    }

    /* === ESTILOS PARA DIFERENTES TIPOS === */

    /* Métodos */
    .cm-tooltip-autocomplete ul li[data-type="method"]::before {
        content: "⚡";
        color: #4fc3f7;
        font-weight: bold;
    }

    /* Variables/Instancias */
    .cm-tooltip-autocomplete ul li[data-type="variable"]::before,
    .cm-tooltip-autocomplete ul li[data-type="class"]::before {
        content: "📦";
        color: #81c784;
        font-weight: bold;
    }

    /* === TEXTO DE LAS OPCIONES ===  REVISAR */

    /* Nombre principal de la opción */
    .cm-completionLabel {
        font-weight: 600 !important;
        color: inherit !important;
    }

    /* Información detallada (tipos, parámetros) */
    .cm-completionDetail {
        color: #f0efefff !important;
        font-style: italic !important;
        font-size: 14px !important;
        margin-right: auto !important;
    }

    /* Información adicional */
    .cm-completionInfo {
        color: #aaaaaa !important;
        font-size: 14px !important;
        max-width: 250px !important;
    }

    /* === ANIMACIONES === */
    .cm-tooltip-autocomplete {
        animation: slideIn 0.2s ease-out !important;
    }

    @keyframes slideIn {
        from {
            opacity: 0;
            transform: translateY(-10px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }

    /* === SCROLL PERSONALIZADO === */
    .cm-tooltip-autocomplete::-webkit-scrollbar {
        width: 6px !important;
    }

    .cm-tooltip-autocomplete::-webkit-scrollbar-track {
        background: #2d2d2d !important;
        border-radius: 3px !important;
    }

    .cm-tooltip-autocomplete::-webkit-scrollbar-thumb {
        background: #555555 !important;
        border-radius: 3px !important;
    }

    .cm-tooltip-autocomplete::-webkit-scrollbar-thumb:hover {
        background: #666666 !important;
    }

    /* === ESTILOS ADICIONALES PARA MEJOR UX === */

    /* Separador visual entre diferentes tipos */
    .cm-tooltip-autocomplete ul li + li[data-type]:not([data-type=""]) {
        border-top: 1px solid #333333;
        margin-top: 4px !important;
        padding-top: 8px !important;
    }

    /* Texto de ayuda para el comando "help" */
    .cm-tooltip-autocomplete ul li[data-type="class"] .cm-completionLabel {
        color: #ffb74d !important;
    }

    /* === RESPONSIVE === */
    @media (max-width: 768px) {
        .cm-tooltip-autocomplete {
            max-width: 90vw !important;
            font-size: 12px !important;
        }

        .cm-tooltip-autocomplete ul li {
            padding: 6px 10px !important;
        }
    }
`;

const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const handleDayChange = (
    selectedDay: string,
    isChecked: boolean,
    formData: any,
    handleInputChange: (field: string, value: any) => void
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
    onWidthChange?: (width: number) => void;
    digitalTwinSelected: IDigitalTwin;
    handlePipelineUiChanged: (isPipelineUiChanged: any) => void;
    mqttTopicsData: IMqttTopicData[];
}

const NodePropertiesPanel: React.FC<NodePropertiesPanelProps> = ({
    isOpen,
    onClose,
    selectedNode,
    onUpdateNode,
    onWidthChange,
    digitalTwinSelected,
    handlePipelineUiChanged,
    mqttTopicsData,
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

    // Estados para el redimensionamiento - Enfoque híbrido optimizado
    const [width, setWidth] = useState(550);
    const [isDragging, setIsDragging] = useState(false);
    const dragStartRef = useRef({ x: 0, widthInicial: 0 });
    const panelRef = useRef<HTMLDivElement>(null);
    const mlModelsTable = useMlModelsTableInGroup(digitalTwinSelected.groupId);

    // Función para actualizar el width usando CSS nativo
    const updatePanelWidth = useCallback((newWidth: number) => {
        if (panelRef.current) {
            panelRef.current.style.setProperty("--panel-width", `${newWidth}px`);
        }
    }, []);

    useEffect(() => {
        if (selectedNode && selectedNode.type === "Function") {
            updatePanelWidth(800);
        }
    }, [selectedNode, updatePanelWidth]);

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
        [width, setDraggingClass]
    );

    // OPTIMIZACIÓN MÁXIMA: Solo CSS durante el drag, sin React re-renders
    const handleDrag = useCallback(
        (e: MouseEvent) => {
            if (!isDragging) return;

            const deltaX = e.clientX - dragStartRef.current.x;
            const newWidth = dragStartRef.current.widthInicial + deltaX;

            let widthMin = 550;
            let widthMax = 550;
            if (selectedNode && selectedNode.type === "Function") {
                widthMin = 800;
                widthMax = 1370;
            }

            if (newWidth >= widthMin && newWidth <= widthMax) {
                // Solo actualización CSS, sin setState durante el drag
                updatePanelWidth(newWidth);
            }
        },
        [isDragging, selectedNode, updatePanelWidth]
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
            onWidthChange?.(computedWidth);
        }
    }, [onWidthChange, setDraggingClass]);

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

        mqttTopicsData.forEach((topic) => {
            if (topic.topicRef.slice(0, 7) === "dev2pdb") {
                listenTopics.push(topic.topicRef);
                publishTopics.push(topic.topicRef);
            }
        });

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
            "sim2state"
        );

        setListenTopicsRef(listenTopics);
        setPublishTopicsRef(publishTopics);
    }, [mqttTopicsData]);

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
        setTimeout(() => {
            setIsClosing(false);
            onClose();
        }, 300);
    }, [onClose]);

    const handleInputChange = useMemo(() => createInputChangeHandler(setFormData), [createInputChangeHandler]);

    const handleDebugToggle = useMemo(
        () => createDebugToggleHandler(setFormData, isDebugEnabled, setIsDebugEnabled),
        [createDebugToggleHandler, isDebugEnabled]
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
    }, [selectedNode, formData, onUpdateNode, handleClose, setOriginalData]);

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
        const excludedTypes = ["Publish", "Email", "Telegram"];
        return !excludedTypes.includes(nodeType);
    };

    const hoverFnDocs = useCallback((view: any, pos: any, side: any) => {
        const { state } = view;
        const word = state.wordAt(pos);
        if (!word) return null;
        const name = state.sliceDoc(word.from, word.to);
        if (!name) return null;
        const line = state.doc.lineAt(pos);
        const lineFullText = line.text;
        const fullDoc = state.doc.toString();
        const info = GetVariableInfo(name, fullDoc, lineFullText);
        if (!info) return null;

        let methodsOptions = "Methods:";
        if (info.doc === "Method for give access to different packages by destructuring") {
            methodsOptions = "Destructuring options:";
        }

        return {
            pos: word.from,
            end: word.to,
            above: false,
            strictSide: true,
            create() {
                const dom = document.createElement("div");
                dom.className = "scrollable";
                dom.style.maxWidth = "600px";
                dom.style.maxHeight = "300px";
                dom.style.padding = "6px 8px";
                dom.style.overflowY = "auto";
                const style = document.createElement("style");
                style.textContent = `
                    .scrollable::-webkit-scrollbar { 
                        width: 8px;
                        height: 8px;
                    }
                    .scrollable::-webkit-scrollbar-track {
                        background: #30363fff;
                    }
                    .scrollable::-webkit-scrollbar-thumb { 
                        background: #4b5563;
                        border-radius: 4px;
                    }
                    .scrollable::-webkit-scrollbar-thumb:hover {
                        background: #6b7280;
                    }
                `;
                document.head.appendChild(style);
                dom.style.fontFamily = "ui-monospace, SFMono-Regular, Menlo, monospace";
                dom.style.fontSize = "12px";
                dom.innerHTML = `
                    <div style="font-weight:600; margin-bottom:4px;">${info.doc}</div>
                    <div style="line-height:1.35;">${info.sig}</div>
                    ${
                        info.constants && info.constants.length > 0
                            ? `<div style="margin-top:6px; font-weight:600;">Constants:</div>
                        <ul style="margin:4px 0 0 16px; padding:0; list-style-type: disc;">
                            ${info.constants
                                .map((constant) => `<li style="margin-bottom:2px;">${constant}</li>`)
                                .join("")}
                        </ul>`
                            : ""
                    }
                    ${
                        info.methods && info.methods.length > 0
                            ? `<div style="margin-top:6px; font-weight:600;">${methodsOptions}</div>
                        <ul style="margin:4px 0 0 16px; padding:0; list-style-type: disc;">
                            ${info.methods.map((method) => `<li style="margin-bottom:2px;">${method}</li>`).join("")}
                        </ul>`
                            : ""
                    }`;
                return { dom };
            },
        };
    }, []);

    const codeMirrorExtensions = useMemo(
        () => [
            javascript({ typescript: true }),
            javascriptLanguage.data.of({
                autocomplete: GeneralizedCompletion,
            }),
            indentUnit.of("    "),
            indentOnInput(),
            hoverTooltip(hoverFnDocs, { hoverTime: 180 }),
            keymap.of([...completionKeymap, indentWithTab, reIndentCommand]),
        ],
        [hoverFnDocs]
    );

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
                    onChange={(e) => handleInputChange("numOutputs", Math.max(0, parseInt(e.target.value)))}
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
                                        onChange={(e) => handleInputChange("label", e.target.value)}
                                        placeholder="Node name"
                                    />
                                </FormGroup>
                                {renderOutputSelector()}
                            </>
                        )}
                        {activeTab === "onInitiation" && (
                            <CodeMirrorWrapper>
                                <CodeMirror
                                    value={
                                        formData.onInitiationScript ||
                                        "function init() {\n    const go = Go();\n    const { log, time } = go.All();\n\n    // Your code here\n}"
                                    }
                                    height="auto"
                                    minHeight="500px"
                                    extensions={codeMirrorExtensions}
                                    theme={oneDark}
                                    onChange={(value) => handleInputChange("onInitiationScript", value)}
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
                        )}
                        {activeTab === "onStart" && (
                            <CodeMirrorWrapper>
                                <CodeMirror
                                    value={
                                        formData.onStartScript ||
                                        "function start() {\n    const go = Go();\n    const { log, time } = go.All();\n\n    // Your code here\n}"
                                    }
                                    height="auto"
                                    minHeight="500px"
                                    extensions={codeMirrorExtensions}
                                    theme={oneDark}
                                    onChange={(value) => handleInputChange("onStartScript", value)}
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
                        )}
                        {activeTab === "onMessage" && (
                            <CodeMirrorWrapper>
                                <CodeMirror
                                    value={
                                        formData.onMessageScript ||
                                        "function process(msg) {\n    const go = Go();\n    const { log, time } = go.All();\n\n    // Your code here\n    return msg;\n}"
                                    }
                                    height="auto"
                                    minHeight="500px"
                                    extensions={codeMirrorExtensions}
                                    theme={oneDark}
                                    onChange={(value) => handleInputChange("onMessageScript", value)}
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
                        )}
                    </TabContentFunction>
                </PanelContent>
            </>
        );
    };

    const renderInjectTabs = () => {
        const tabs = [
            { id: "settings", label: "Settings" },
            { id: "injection", label: "Injection" },
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
                                        onChange={(e) => handleInputChange("label", e.target.value)}
                                        placeholder="Node name"
                                    />
                                </FormGroup>
                                {renderOutputSelector()}
                                <FormGroup>
                                    <Label>Repeat</Label>
                                    <Select
                                        value={formData.repeat || "none"}
                                        onChange={(e) => handleInputChange("repeat", e.target.value)}
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
                                            onChange={(e) =>
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
                                                onChange={(e) => handleInputChange("timezone", e.target.value)}
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
                                                            onChange={(e) =>
                                                                handleDayChange(
                                                                    day,
                                                                    e.target.checked,
                                                                    formData,
                                                                    handleInputChange
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
                                        onChange={(e) => handleInputChange("injectionType", e.target.value)}
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
                                                    keymap.of([...completionKeymap, indentWithTab, reIndentCommand]),
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
                    </TabContentFunction>
                </PanelContent>
            </>
        );
    };

    const renderAiAgentTabs = () => {
        const tabs = [
            { id: "settings", label: "Settings" },
            { id: "system_prompt", label: "System prompt" },
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
                                        onChange={(e) => handleInputChange("label", e.target.value)}
                                        placeholder="Node name"
                                    />
                                </FormGroup>
                                {renderOutputSelector()}
                                <FormGroup>
                                    <Label>Model</Label>
                                    <Select
                                        value={formData.llmModel || "openai:gpt-oss-120b"}
                                        onChange={(e) => handleInputChange("llmModel", e.target.value)}
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
                                        onChange={(e) =>
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
                                        onChange={(e) => handleInputChange("llmTopK", parseInt(e.target.value))}
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
                                        onChange={(e) => handleInputChange("llmTopP", parseFloat(e.target.value))}
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
                                        onChange={(e) => handleInputChange("systemPrompt", e.target.value)}
                                        placeholder="Your system prompt"
                                        rows={4}
                                    />
                                </FormGroup>
                            </>
                        )}
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
        } else if (nodeType === "Inject") {
            return renderInjectTabs();
        } else if (nodeType === "AiAgent") {
            return renderAiAgentTabs();
        }

        // Para otros tipos de nodos, mostrar contenido simple
        return (
            <PanelContent>
                <TabContent>
                    <FormGroup>
                        <Label>Node Name</Label>
                        <Input
                            type="text"
                            value={formData.label || ""}
                            onChange={(e) => handleInputChange("label", e.target.value)}
                            placeholder="Node name"
                        />
                    </FormGroup>
                    {renderOutputSelector()}
                    {renderNodeSpecificFields()}
                </TabContent>
            </PanelContent>
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
                                onChange={(e) => handleInputChange("listenTo", e.target.value)}
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
                                    value={formData.topic}
                                    onChange={(e) => handleInputChange("topic", e.target.value)}
                                >
                                    {listenTopicsRef.map((topic) => (
                                        <option key={topic} value={topic}>
                                            {topic}
                                        </option>
                                    ))}
                                </Select>
                            ) : (
                                <Input
                                    type="text"
                                    value={listenTopicsRef.includes(formData.topic) ? "your_topic" : formData.topic}
                                    onChange={(e) => handleInputChange("topic", e.target.value)}
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
                                onChange={(e) => {
                                    handleInputChange("publishTo", e.target.value);
                                    if (e.target.value === "Topic reference") {
                                        handleInputChange("topic", "dtm2sim");
                                    }
                                }}
                            >
                                <option value="Topic reference">Topic reference</option>
                                <option value="Generic nats">Generic nats</option>
                                <option value="Generic mqtt">Generic mqtt</option>
                            </Select>
                        </FormGroup>
                        {formData.publishTo === "Topic reference" && (
                            <FormGroup>
                                <Label>Topic</Label>
                                <Select
                                    value={formData.topic}
                                    onChange={(e) => handleInputChange("topic", e.target.value)}
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
                                    value={publishTopicsRef.includes(formData.topic) ? "your_topic" : formData.topic}
                                    onChange={(e) => handleInputChange("topic", e.target.value)}
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
                            onChange={(e) => handleInputChange("duration", Math.max(0, parseFloat(e.target.value)))}
                            placeholder="0.0"
                        />
                    </FormGroup>
                );

            case "MlModel":
                return (
                    <>
                        <FormGroup>
                            <Label>Machine learning model</Label>
                            <Select
                                value={formData.mlModelId}
                                onChange={(e) => handleInputChange("mlModelId", parseInt(e.target.value))}
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
                                value={formData.batchSize || 1}
                                onChange={(e) => handleInputChange("batchSize", parseInt(e.target.value))}
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
                                onChange={(e) => handleInputChange("toOptions", e.target.value)}
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
                                    onChange={(e) => handleInputChange("to", e.target.value)}
                                    placeholder="myemail@example.com"
                                />
                            </FormGroup>
                        )}
                        <FormGroup>
                            <Label>Message Options</Label>
                            <Select
                                value={formData.messageOptions || "Message received options"}
                                onChange={(e) => handleInputChange("messageOptions", e.target.value)}
                            >
                                <option value="Message received options">Message received options</option>
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
                                        onChange={(e) => handleInputChange("subject", e.target.value)}
                                        placeholder="Email Subject"
                                    />
                                </FormGroup>
                                <FormGroup>
                                    <Label>Body</Label>
                                    <TextArea
                                        value={formData.body || ""}
                                        onChange={(e) => handleInputChange("body", e.target.value)}
                                        placeholder="Email Body"
                                        rows={4}
                                    />
                                </FormGroup>
                            </>
                        )}
                    </>
                );

            case "Telegram":
                return (
                    <>
                        <FormGroup>
                            <Label>Options</Label>
                            <Select
                                value={formData.options || "Group notification options"}
                                onChange={(e) => handleInputChange("options", e.target.value)}
                            >
                                <option value="Group notification options">Group notification options</option>
                                <option value="Custom telegram options">Custom telegram options</option>
                            </Select>
                        </FormGroup>
                        {formData.options === "Custom telegram options" && (
                            <>
                                <FormGroup>
                                    <Label>Chat ID</Label>
                                    <Input
                                        type="text"
                                        value={formData.chatId || ""}
                                        onChange={(e) => handleInputChange("chatId", e.target.value)}
                                        placeholder="123456789"
                                    />
                                </FormGroup>
                                <FormGroup>
                                    <Label>Telegram Bot Token</Label>
                                    <Input
                                        type="text"
                                        value={formData.telegramBotToken || ""}
                                        onChange={(e) => handleInputChange("telegramBotToken", e.target.value)}
                                        placeholder="your-telegram-bot-token"
                                    />
                                </FormGroup>
                            </>
                        )}
                        <FormGroup>
                            <Label>Message Options</Label>
                            <Select
                                value={formData.messageOptions || "Message received options"}
                                onChange={(e) => handleInputChange("messageOptions", e.target.value)}
                            >
                                <option value="Message received options">Message received options</option>
                                <option value="Custom message">Custom message</option>
                            </Select>
                        </FormGroup>
                        {formData.messageOptions === "Custom message" && (
                            <FormGroup>
                                <Label>Message</Label>
                                <Input
                                    type="text"
                                    value={formData.message || ""}
                                    onChange={(e) => handleInputChange("message", e.target.value)}
                                    placeholder="Hello from OSI4IOT!"
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
                                onChange={(e) => handleInputChange("batchMode", e.target.value)}
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
                                    onChange={(e) =>
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
                                    onChange={(e) =>
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
