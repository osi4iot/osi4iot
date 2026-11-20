// The chart of a 3D Surface panel: ECharts with ECharts GL (WebGL). It is a module of its own, loaded only when a
// 3D Surface is shown (React.lazy): ECharts GL is large and the other twins do not need it.
//
// It keeps the view the user has turned and zoomed: only the first options say where the camera is.
import { FC, useEffect, useRef, useState } from "react";
import * as echarts from "echarts/core";
import { TooltipComponent, VisualMapComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
// only the surface and its 3D grid (echarts-gl/charts would bring all the charts of ECharts GL)
import { install as SurfaceSeries } from "echarts-gl/lib/chart/surface/install";
import { install as Grid3DComponent } from "echarts-gl/lib/component/grid3D/install";

echarts.use([SurfaceSeries, Grid3DComponent, VisualMapComponent, TooltipComponent, CanvasRenderer]);

export interface SurfaceChartProps {
    option: Record<string, unknown>;
    label: string;
}

const withoutCamera = (option: Record<string, unknown>) => {
    const grid3D = option.grid3D as Record<string, unknown> | undefined;
    if (!grid3D) return option;
    const { viewControl: _camera, ...rest } = grid3D;
    return { ...option, grid3D: rest };
};

const SurfaceChart: FC<SurfaceChartProps> = ({ option, label }) => {
    const ref = useRef<HTMLDivElement>(null);
    const chartRef = useRef<echarts.ECharts | null>(null);
    const firstRef = useRef(true);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        let chart: echarts.ECharts | null = null;
        try {
            chart = echarts.init(el, undefined, { renderer: "canvas" });
        } catch {
            setFailed(true);
            return;
        }
        chartRef.current = chart;
        firstRef.current = true;
        const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => chart?.resize()) : null;
        observer?.observe(el);
        return () => {
            observer?.disconnect();
            chart?.dispose();
            chartRef.current = null;
        };
    }, []);

    useEffect(() => {
        const chart = chartRef.current;
        if (!chart) return;
        try {
            chart.setOption(firstRef.current ? option : withoutCamera(option), { lazyUpdate: true });
            firstRef.current = false;
        } catch {
            // no WebGL in this browser
            setFailed(true);
        }
    }, [option]);

    return failed ? (
        <p role="alert" style={{ margin: 12, color: "#d6a35c", fontSize: 13 }}>
            This browser cannot draw 3D surfaces (WebGL is not available).
        </p>
    ) : (
        <div ref={ref} role="img" aria-label={label} style={{ position: "absolute", inset: 0 }} />
    );
};

export default SurfaceChart;
