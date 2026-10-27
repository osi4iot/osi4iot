import { FC, SyntheticEvent } from "react";
import styled, { css } from "styled-components";

// Botones de los formularios: abajo a la derecha, separados de los campos por una línea. En pantallas
// estrechas ocupan todo el ancho a partes iguales.
const ButtonsContainer = styled.div`
    flex-shrink: 0;
    margin-top: 8px;
    padding-top: 16px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    align-items: center;
    gap: 12px;
`;

const Button = styled.button<{ $secondary?: boolean }>`
    min-width: 130px;
    background-color: #3274d9;
    padding: 9px 22px;
    color: white;
    border: 1px solid #2c3235;
    border-radius: 10px;
    outline: none;
    cursor: pointer;
    box-shadow: 0 4px #173b70;
    font-size: 15px;

    &:hover {
        background-color: #2461c0;
    }

    &:active {
        background-color: #2461c0;
        box-shadow: 0 2px #173b70;
        transform: translateY(2px);
    }

    &:focus-visible {
        outline: 2px solid #3d82f0;
        outline-offset: 2px;
    }

    ${({ $secondary }) =>
        $secondary &&
        css`
            background-color: #2a2d33;
            box-shadow: 0 4px #15171a;

            &:hover,
            &:active {
                background-color: #34383f;
                box-shadow: 0 2px #15171a;
            }
        `}

    &:disabled {
        cursor: not-allowed;
        background-color: #3c3d40;
        box-shadow: 0 4px #19191a;
        color: #c3c9d1;
    }

    @media (max-width: 600px) {
        flex: 1;
        min-width: 0;
    }
`;

interface FormButtonsProps {
    onCancel: (e: SyntheticEvent) => void;
    isValid: boolean;
    isSubmitting: boolean;
    // ya no se usa (todos los formularios ocupan el ancho disponible); se mantiene por compatibilidad
    isWideForm?: boolean;
}

const FormButtons: FC<FormButtonsProps> = ({ onCancel, isValid, isSubmitting }) => (
    <ButtonsContainer>
        <Button type="button" $secondary onClick={onCancel}>
            Cancel
        </Button>
        <Button type="submit" disabled={!isValid || isSubmitting}>
            Submit
        </Button>
    </ButtonsContainer>
);

export default FormButtons;
