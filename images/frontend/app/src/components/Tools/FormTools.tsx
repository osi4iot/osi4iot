import { useFormikContext } from "formik";
import { FC, ReactNode, useEffect, useRef } from "react";
import styled, { css } from "styled-components";

// The scroll bars of the forms (dark, rounded), for any scrolling box
// inside them: lists, pickers.
export const scrollbarStyle = css`
    &::-webkit-scrollbar {
        width: 10px;
        height: 10px;
    }

    &::-webkit-scrollbar-track {
        background: #202226;
        border-radius: 5px;
    }

    &::-webkit-scrollbar-thumb {
        background: #2c3235;
        border-radius: 5px;
    }

    &::-webkit-scrollbar-thumb:hover {
        background-color: #343840;
    }
`;

// Tarjeta de los formularios de crear / editar: ocupa todo el ancho y el alto disponibles del área de
// contenido; los campos se reparten en columnas (ControlsContainer) según el ancho y los botones quedan
// abajo. En pantallas estrechas pasa a una sola columna sin márgenes laterales.
export const FormCard = styled.div`
    font-size: 12px;
    flex: 1 1 0;
    min-height: 320px;
    width: calc(100% - 32px);
    margin: 0 16px 16px;
    padding: 20px 24px 18px;
    display: flex;
    flex-direction: column;
    /* mismo fondo que los campos (muchos usan #202226 en sus recuadros internos) */
    background-color: #202226;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 14px;

    & > form {
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
    }

    @media (max-width: 600px) {
        width: 100%;
        margin: 0 0 8px;
        padding: 14px 12px;
        border-radius: 12px;
    }
`;

// Nombres anteriores (antes uno tenía ancho fijo y el otro se podía ensanchar arrastrando el borde)
export const DraggableFormContainer = FormCard;
export const StaticFormContainer = FormCard;

export const ErrorMessage = styled.div`
    color: #f87171;
    font-size: 12px;
    margin-top: 4px;
    margin-left: 3px;
`;

interface FieldErrorScrollerProps {
    name: string;
}

export const FieldErrorScroller: FC<FieldErrorScrollerProps> = ({ name }) => {
    const formik = useFormikContext<any>();
    const errorRef = useRef<HTMLDivElement>(null);

    const error = formik.errors[name] as string | undefined;
    const touched = formik.touched[name] as boolean | undefined;

    useEffect(() => {
        if (error && touched && errorRef.current) {
            errorRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
    }, [error, touched]);

    if (!touched || !error) return null;

    return (
        <div ref={errorRef}>
            <ErrorMessage>{error}</ErrorMessage>
        </div>
    );
};

// Campos del formulario en una rejilla adaptable de columnas de al menos 300 px:
//  1. Primero los campos sencillos (etiqueta + entrada o desplegable), en filas alineadas.
//  2. Después, en una fila nueva, los recuadros con título (FormSection: archivos, localización, usuarios...)
//     y cualquier otro bloque compuesto, cada uno en su columna.
//  3. Al final, a todo el ancho, los campos grandes (editores de código, áreas de texto, mapas, tablas, filas
//     de campos); cualquier otro elemento puede pedirlo con el atributo data-wide.
// El orden visual se consigue con "order" de CSS, sin tocar el de los formularios.
export const ControlsContainer = styled.div`
    flex: 1 1 auto;
    min-height: 0;
    width: 100%;
    padding: 0 8px 4px 2px;
    overflow-y: auto;
    overflow-x: hidden;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr));
    column-gap: 28px;
    align-content: start;
    align-items: start;
    ${scrollbarStyle}

    & > * {
        min-width: 0;
        margin-top: 0 !important;
        margin-bottom: 18px !important;
        order: 2;
    }

    /* campos sencillos: su primer hijo es la etiqueta */
    & > :has(> label:first-child) {
        order: 0;
    }

    /* salto de fila entre los campos sencillos y los recuadros */
    &::after {
        content: "";
        order: 1;
        grid-column: 1 / -1;
    }

    & > [data-wide],
    & > :has(.cm-editor, textarea, .leaflet-container, table, iframe, [data-wide]) {
        grid-column: 1 / -1;
        order: 3;
    }

    /* títulos sueltos (un div solo con texto) que queden fuera de un FormSection */
    & > div:not(:has(*)) {
        grid-column: 1 / -1;
        margin-bottom: 6px !important;
        font-size: 13px;
        color: #c3c9d1;
    }

    div:first-child {
        margin-top: 0;
    }
`;

const SectionTitle = styled.div`
    margin: 0 0 6px 2px;
    font-size: 13px;
    color: #c3c9d1;
`;

const Section = styled.div`
    min-width: 0;

    /* los recuadros de dentro ocupan todo el ancho de la columna */
    & > div:not(${SectionTitle}) {
        width: 100%;
    }
`;

// Recuadro con título de un formulario (p. ej. "Pipeline", "Floor location", "Telegram bot"): título y
// contenido forman un solo bloque de la rejilla de ControlsContainer.
export const FormSection: FC<{ title: ReactNode; children: ReactNode }> = ({ title, children }) => (
    <Section data-section>
        <SectionTitle>{title}</SectionTitle>
        {children}
    </Section>
);
