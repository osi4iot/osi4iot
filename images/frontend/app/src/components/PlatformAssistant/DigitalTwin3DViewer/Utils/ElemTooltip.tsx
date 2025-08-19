import { Html } from "@react-three/drei";
import styled from "styled-components";

const ElemTooltipContainer = styled.div`
    position: absolute;
    display: inline-block;
    top: -32px;
`;

const ElemTooltipBox = styled.div`
    transform: translateX(-50%);
    bottom: 100%;
    left: 50%;
    margin-bottom: 8px;
    padding: 6px 8px;
    background-color: #1e40af; /* Azul oscuro para elementos */
    color: white;
    font-size: 14px;
    border-radius: 4px;
    white-space: nowrap;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    z-index: 50;
    transition: opacity 0.2s ease-in-out, visibility 0.2s ease-in-out;

    &::after {
        content: "";
        position: absolute;
        top: 100%;
        left: 50%;
        transform: translateX(-50%);
        margin-top: -1px;
        width: 0;
        height: 0;
        border-left: 6px solid transparent;
        border-right: 6px solid transparent;
        border-top: 6px solid #1e40af; /* Mismo color para la flecha */
    }
`;

export const ElemTooltip = ({ elemId, position }: { elemId: number; position: THREE.Vector3 }) => {
    return (
        <group position={position}>
            <Html castShadow receiveShadow>
                <ElemTooltipContainer>
                    <ElemTooltipBox>Elem {elemId}</ElemTooltipBox>
                </ElemTooltipContainer>
            </Html>
        </group>
    );
};