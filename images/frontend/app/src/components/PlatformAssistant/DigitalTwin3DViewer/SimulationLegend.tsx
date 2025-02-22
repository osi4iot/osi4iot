import React, { FC, useEffect, useRef } from 'react'
import styled from 'styled-components';
import { IResultRenderInfo } from './Model';

interface SimulationLegendProps {
    resultRenderInfo: IResultRenderInfo;
    canvasContainerRef: any;
}

interface SimulationLegendContainerProps {
    containerHeight: number;
}

const SimulationLegendContainer = styled.div<SimulationLegendContainerProps>`
    background-color: #212121;
    overflow: hidden;
`;

const SimulationLegendDiv = styled.div`
  border-radius: 15px;
  background-color: #212121;
  border: 1px solid #141619;
  overflow: hidden;
  position: absolute;
  bottom: calc((100vh - 155px)/2 - 180px);
  left: 20px;
`;

const SimulationLegend: FC<SimulationLegendProps> = ({
    resultRenderInfo,
    canvasContainerRef,
}) => {
    const mountRef = useRef(null);
    
    useEffect(() => {
        if (resultRenderInfo === undefined) return;
        
        const currentRef = mountRef.current as any;
        const legendRenderer = resultRenderInfo.legendRenderer;
        const legendCamera = resultRenderInfo.legendCamera;
        const legendScene = resultRenderInfo.legendScene;
        if (currentRef) {
            currentRef.appendChild(legendRenderer.domElement);
        }

        const animate = function () {
            requestAnimationFrame(animate);
            legendRenderer.render(legendScene, legendCamera);
        };

        animate();

        return () => {
            currentRef.removeChild(legendRenderer.domElement);
        }

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [resultRenderInfo])

    return (
        <SimulationLegendContainer containerHeight={canvasContainerRef.current.getBoundingClientRect().height} >
            <SimulationLegendDiv ref={mountRef} />
        </SimulationLegendContainer >
    )

};


export default SimulationLegend;