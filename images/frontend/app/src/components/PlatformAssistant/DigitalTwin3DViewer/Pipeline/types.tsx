import styled, { keyframes, css } from "styled-components";

// CSS estándar para el resizing - mejor performance
export const resizableStyles = `
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
export const ReIndentCommand = {
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

export const PanelContainer = styled.div.attrs<{ isOpen: boolean; isClosing: boolean }>((props) => ({
    style: {
        transform: `translateX(${props.isOpen ? "0" : "-100%"})`,
        opacity: props.isOpen ? "1" : "0",
    },
    className: "resizable-panel",
}))<{ isOpen: boolean; isClosing: boolean }>`
    position: fixed;
    left: 262px;
    top: 203px;
    height: calc(100vh - 219px);
    background-color: #2a2a2a;
    border-right: 1px solid #444;
    box-shadow: 2px 0 10px rgba(0, 0, 0, 0.3);
    z-index: 1001;
    transition:
        transform 0.3s cubic-bezier(0.4, 0, 0.2, 1),
        opacity 0.3s ease;
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

export const ResizeHandle = styled.div<{ isDragging: boolean }>`
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

export const PanelHeader = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 20px;
    border-bottom: 1px solid #444;
`;

export const PanelTitle = styled.h2`
    color: #e7e3df;
    font-size: 14px;
    font-weight: 600;
    margin: 0;
    display: flex;
    align-items: center;
    gap: 10px;
    font-family: Helvetica, Arial, sans-serif;
`;

export const NodeTypeIndicator = styled.span<{ nodeType: string }>`
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
            case "Trigger":
                return "#a6bbcf";
            case "Delay":
                return "#a8a152";
            case "MlModel":
                return "#bd5f25ff";
            case "AiAgent":
                return "#B8B1FB";
            case "Email":
                return "#4a90e2";
            case "TelegramListen":
                return "#4a90e2";
            case "TelegramSend":
                return "#4a90e2";
            default:
                return "#6b7280";
        }
    }};
    color: #111827;
`;

export const HeaderControls = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
`;

export const DebugToggle = styled.button<{ isActive: boolean }>`
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

export const CloseButton = styled.button`
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
export const TabsContainer = styled.div`
    display: flex;
    border-bottom: 1px solid #444;
    background-color: #2a2a2a;
`;

export const Tab = styled.button<{ isActive: boolean }>`
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

export const PanelContent = styled.div`
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

export const TabContent = styled.div`
    padding: 16px;
`;

export const TabContentFunction = styled.div`
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

export const Input = styled.input`
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
export const CheckboxGroup = styled.div`
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: 8px;
    margin-top: 8px;
`;

export const CheckboxContainer = styled.div`
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: 8px;
    margin-top: 8px;
    margin-bottom: 16px;
`;

export const CheckboxItem = styled.label`
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

export const CheckboxInput = styled.input`
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

export const Select = styled.select`
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

export const TextArea = styled.textarea`
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

export const TextAreaSystemPrompt = styled.textarea`
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

export const ButtonGroup = styled.div`
    display: flex;
    gap: 8px;
    padding: 16px 20px;
    border-bottom: 1px solid #444;
`;

export const Button = styled.button<{ variant?: "primary" | "secondary" }>`
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
