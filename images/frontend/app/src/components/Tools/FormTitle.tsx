import { FC } from "react";
import styled from "styled-components";
import MiniLoader from "./MiniLoader";

// Título de los formularios, alineado a la izquierda con la tarjeta del formulario (FormCard)
const TitleContainer = styled.div`
    width: calc(100% - 32px);
    margin: 18px 16px 12px;
    display: flex;
    flex-direction: row;
    justify-content: flex-start;
    align-items: center;
    gap: 10px;
    flex-shrink: 0;

    @media (max-width: 600px) {
        width: 100%;
        margin: 6px 0 10px;
        padding: 0 4px;
    }
`;

const Title = styled.h2`
    margin: 0;
    font-weight: 500;
    color: white;
    font-size: 18px;
`;

interface FormTitleProp {
    isSubmitting?: boolean;
    children: React.ReactNode;
}

const FormTitle: FC<FormTitleProp> = ({ isSubmitting = false, children }) => (
    <TitleContainer>
        <Title>{children}</Title>
        {isSubmitting && <MiniLoader />}
    </TitleContainer>
);

export default FormTitle;
