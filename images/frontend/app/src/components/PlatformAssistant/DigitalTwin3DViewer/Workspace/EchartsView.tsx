// An ECharts chart that fills its box: only the parts the panels use are loaded (lines, bars, scatter,
// gauges, marks, tooltip, grid). It follows the size of its box and draws the options it is given.
import { FC, useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { BarChart, GaugeChart, LineChart, ScatterChart } from "echarts/charts";
import { GridComponent, MarkAreaComponent, MarkLineComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";

echarts.use([LineChart, BarChart, ScatterChart, GaugeChart, GridComponent, TooltipComponent, MarkLineComponent, MarkAreaComponent, CanvasRenderer]);

export interface EchartsViewProps {
    option: Record<string, unknown> | null;
    label: string;
    onSize?: (width: number, height: number) => void;
}

const EchartsView: FC<EchartsViewProps> = ({ option, label, onSize }) => {
    const ref = useRef<HTMLDivElement>(null);
    const chartRef = useRef<echarts.ECharts | null>(null);
    const sizeRef = useRef(onSize);
    sizeRef.current = onSize;

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        let chart: echarts.ECharts | null = null;
        try {
            chart = echarts.init(el, undefined, { renderer: "canvas" });
        } catch {
            chart = null; // no canvas (tests)
        }
        chartRef.current = chart;
        const report = () => {
            chart?.resize();
            sizeRef.current?.(el.clientWidth, el.clientHeight);
        };
        report();
        let observer: ResizeObserver | null = null;
        if (typeof ResizeObserver !== "undefined") {
            observer = new ResizeObserver(report);
            observer.observe(el);
        }
        return () => {
            observer?.disconnect();
            chart?.dispose();
            chartRef.current = null;
        };
    }, []);

    useEffect(() => {
        if (chartRef.current && option) chartRef.current.setOption(option as any, { notMerge: true });
    }, [option]);

    return <div ref={ref} role="img" aria-label={label} style={{ position: "absolute", inset: 0 }} />;
};

export default EchartsView;
