import styled from "styled-components";

import React from "react";
import { FormGroup, Label } from "../types";

// Función helper para generar opciones de horas
const generateHourOptions = () => {
    const options = [];
    for (let i = 0; i < 24; i++) {
        const hour = i.toString().padStart(2, "0");
        options.push(
            <option key={i} value={hour}>
                {hour}
            </option>
        );
    }
    return options;
};

// Función helper para generar opciones de minutos
const generateMinuteOptions = () => {
    const options = [];
    for (let i = 0; i < 60; i++) {
        const minute = i.toString().padStart(2, "0");
        options.push(
            <option key={i} value={minute}>
                {minute}
            </option>
        );
    }
    return options;
};

// Función helper para parsear tiempo "HH:MM" a objeto {hour, minute}
const parseTime = (timeString: string) => {
    if (!timeString || timeString === "") return { hour: "00", minute: "00" };
    const [hour, minute] = timeString.split(":");
    return {
        hour: hour || "00",
        minute: minute || "00",
    };
};

// Función helper para formatear tiempo de objeto a string "HH:MM"
const formatTime = (hour: string, minute: string) => {
    return `${hour}:${minute}`;
};

// Componente TimeSelector reutilizable
interface TimeSelectorProps {
    value: string;
    onChange: (value: string) => void;
    label: string;
}

// Nuevo componente para el contenedor de selectores de tiempo
const TimeSelectContainer = styled.div`
    display: flex;
    gap: 8px;
    align-items: center;
`;

const TimeSelect = styled.select`
    padding: 10px 12px;
    background-color: #374151;
    border: 1px solid #4b5563;
    border-radius: 6px;
    color: #f9fafb;
    font-size: 14px;
    transition: border-color 0.2s;
    min-width: 80px;

    &:focus {
        outline: none;
        border-color: #3b82f6;
        box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
    }

    option {
        background-color: #374151;
        color: #f9fafb;
    }

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

const TimeSeparator = styled.span`
    color: #9ca3af;
    font-size: 16px;
    font-weight: 500;
    margin: 0 4px;
`;

export const TimeSelector: React.FC<TimeSelectorProps> = ({ value, onChange, label }) => {
    const { hour, minute } = parseTime(value);

    const handleHourChange = (newHour: string) => {
        onChange(formatTime(newHour, minute));
    };

    const handleMinuteChange = (newMinute: string) => {
        onChange(formatTime(hour, newMinute));
    };

    return (
        <FormGroup>
            <Label>{label}</Label>
            <TimeSelectContainer>
                <TimeSelect value={hour} onChange={(e) => handleHourChange(e.target.value)}>
                    {generateHourOptions()}
                </TimeSelect>
                <TimeSeparator>:</TimeSeparator>
                <TimeSelect value={minute} onChange={(e) => handleMinuteChange(e.target.value)}>
                    {generateMinuteOptions()}
                </TimeSelect>
            </TimeSelectContainer>
        </FormGroup>
    );
};
