import { FC, ReactNode, useState } from "react";
import styled from "styled-components";

const IconButton = styled.button`
    padding: 1px;
    background: none;
    border: none;
    border-radius: 4px;
    color: #d1d5db;
    cursor: pointer;
    transition: all 0.2s;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;

    * {
        transition: all 0.2s;
    }

    &:hover {
        background-color: #374151 !important;
        color: white;
        
        * {
            color: white !important;
            stroke: white !important;
            background-color: #374151 !important;
        }
    }

    &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
        
        &:hover {
            background: none;
            color: #d1d5db;
            
            * {
                color: #d1d5db !important;
                fill: #d1d5db !important;
                stroke: #d1d5db !important;
            }
        }
    }
`;

const Tooltip = styled.div<{ visible: boolean }>`
    position: absolute;
    bottom: 100%;
    left: 50%;
    transform: translateX(-50%);
    background-color: #1f2937;
    color: white;
    padding: 6px 8px;
    border-radius: 4px;
    font-size: 12px;
    white-space: nowrap;
    pointer-events: none;
    opacity: ${(props) => (props.visible ? 1 : 0)};
    visibility: ${(props) => (props.visible ? "visible" : "hidden")};
    transition: opacity 0.2s, visibility 0.2s;
    z-index: 1000;
    margin-bottom: 7px;
    border: 1px solid #6b7280;

    &::after {
        content: "";
        position: absolute;
        top: 100%;
        left: 50%;
        transform: translateX(-50%);
        width: 0;
        height: 0;
        border-left: 5px solid transparent;
        border-right: 5px solid transparent;
        border-top: 5px solid #1f2937;
    }
    
    &::before {
        content: "";
        position: absolute;
        top: 100%;
        left: 50%;
        transform: translateX(-50%);
        width: 0;
        height: 0;
        border-left: 6px solid transparent;
        border-right: 6px solid transparent;
        border-top: 6px solid #6b7280;
        z-index: -1;
    }
`;

export const TooltipWrapper: FC<{
    children: ReactNode;
    tooltip: string;
    onClick?: () => void;
    disabled?: boolean;
}> = ({ children, tooltip, onClick, disabled }) => {
    const [showTooltip, setShowTooltip] = useState(false);

    return (
        <IconButton
            onClick={onClick}
            disabled={disabled}
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
        >
            {children}
            <Tooltip visible={showTooltip}>{tooltip}</Tooltip>
        </IconButton>
    );
};