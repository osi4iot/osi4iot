import { FC } from "react";
import styled, { keyframes } from "styled-components";

// Pantalla de carga a página completa, igual que la del index.html (la que se ve mientras se descarga la
// aplicación tras recargar con Ctrl-F5), para que no haya saltos entre ambas.
const slide = keyframes`
    0% { transform: translateX(-100%); }
    100% { transform: translateX(250%); }
`;

const Screen = styled.div`
    position: fixed;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 22px;
    background: radial-gradient(ellipse at center, #1b1d22 0%, #0b0c0e 70%);
    color: #c3c9d1;
    font-size: 14px;
    letter-spacing: 0.04em;
    z-index: 1000;

    img {
        width: 72px;
        height: auto;
        opacity: 0.95;
    }
`;

const Bar = styled.div`
    width: 180px;
    height: 3px;
    border-radius: 2px;
    background-color: #202226;
    overflow: hidden;

    div {
        width: 40%;
        height: 100%;
        border-radius: 2px;
        background: linear-gradient(90deg, #3274d9, #62f700);
        animation: ${slide} 1.2s ease-in-out infinite;

        @media (prefers-reduced-motion: reduce) {
            animation: none;
            width: 100%;
        }
    }
`;

const PageLoader: FC<{ label?: string }> = ({ label = "Loading platform…" }) => (
    <Screen role="status" aria-live="polite">
        <img src="/plaftorm_logo.png" alt="" />
        <Bar>
            <div />
        </Bar>
        <span>{label}</span>
    </Screen>
);

export default PageLoader;
