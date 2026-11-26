// An ECharts chart that fills its box: only the parts the panels use are loaded (lines, bars, scatter,
// gauges, heat maps (a picture and its contour lines), marks, tooltip, grid, legend). It follows the size of its box and draws the options it is given.
import { FC, useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { BarChart, CustomChart, GaugeChart, LineChart, PieChart, ScatterChart } from "echarts/charts";
import { GridComponent, LegendComponent, MarkAreaComponent, MarkLineComponent, TooltipComponent, VisualMapComponent } from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
import { ChartPointer } from "./echartsOptions";

// CustomChart (the picture of a heat map), VisualMapComponent and LegendComponent: the heat maps and the legends of the Data charts
echarts.use([
    LineChart,
    BarChart,
    ScatterChart,
    GaugeChart,
    PieChart,
    CustomChart,
    GridComponent,
    TooltipComponent,
    MarkLineComponent,
    MarkAreaComponent,
    VisualMapComponent,
    LegendComponent,
    SVGRenderer,
]);

export interface EchartsViewProps {
    option: Record<string, unknown> | null;
    label: string;
    onSize?: (width: number, height: number) => void;
    // a click on a point, bar, slice or gauge: its series, its value and where
    onClick?: (params: { seriesIndex?: number; dataIndex?: number; value?: unknown; name?: string }, clientX: number, clientY: number) => void;
    // filled with where the pointer is over the chart (the tooltip of the time series)
    pointer?: ChartPointer;
}

// A legend of many series wraps onto more lines in a narrow chart: the plot starts below it (its grid's top is moved
// down to the legend's height as drawn), so that the legend does not cover the curves
const makeRoomForLegend = (chart: echarts.ECharts, option: Record<string, unknown>) => {
    const legend = option.legend as { show?: boolean; top?: number } | undefined;
    const grid = option.grid as { top?: number } | undefined;
    if (!legend?.show || !grid || typeof grid.top !== "number") return;
    try {
        const anyChart = chart as unknown as {
            getModel: () => { getComponent: (type: string) => unknown };
            getViewOfComponentModel: (model: unknown) => { group: { getBoundingRect: () => { height: number } } } | undefined;
        };
        const model = anyChart.getModel().getComponent("legend");
        const height = model ? anyChart.getViewOfComponentModel(model)?.group.getBoundingRect().height : undefined;
        if (!height) return;
        const top = Math.max(grid.top, Math.ceil((legend.top ?? 0) + height + 10));
        const current = (chart.getOption() as { grid?: { top?: number }[] }).grid?.[0]?.top;
        if (current !== top) chart.setOption({ grid: { top } });
    } catch {
        // (an ECharts without these: the legend stays where it is)
    }
};

const EchartsView: FC<EchartsViewProps> = ({ option, label, onSize, onClick, pointer }) => {
    const ref = useRef<HTMLDivElement>(null);
    const chartRef = useRef<echarts.ECharts | null>(null);
    const sizeRef = useRef(onSize);
    sizeRef.current = onSize;
    const clickRef = useRef(onClick);
    clickRef.current = onClick;

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        let chart: echarts.ECharts | null = null;
        try {
            // SVG: sharp at any scale (a canvas presented full screen, zoomed: its panels are scaled, and a canvas
            // renderer's bitmap would be stretched, its lines and labels blurred)
            chart = echarts.init(el, undefined, { renderer: "svg" });
        } catch {
            chart = null; // no canvas (tests)
        }
        chartRef.current = chart;
        if (typeof chart?.on === "function") chart.on("click", (params: any) => {
            const e = params?.event?.event as MouseEvent | undefined;
            clickRef.current?.(params, e?.clientX ?? 0, e?.clientY ?? 0);
        });
        // the pointer over the chart, and how a value of a y axis is drawn (pixels)
        if (pointer && chart && typeof chart.getZr === "function") {
            const drawn = chart;
            pointer.toPixelY = (value, yAxisIndex) => {
                try {
                    const py = drawn.convertToPixel({ yAxisIndex }, value);
                    return typeof py === "number" ? py : null;
                } catch {
                    return null;
                }
            };
            pointer.toPixelX = (value) => {
                try {
                    const px = drawn.convertToPixel({ xAxisIndex: 0 }, value);
                    return typeof px === "number" && Number.isFinite(px) ? px : null;
                } catch {
                    return null;
                }
            };
            pointer.plotRect = () => {
                try {
                    const grid = (drawn as unknown as { getModel: () => { getComponent: (type: string) => any } }).getModel().getComponent("grid");
                    const rect = grid?.coordinateSystem?.getRect?.();
                    return rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null;
                } catch {
                    return null;
                }
            };
            drawn.getZr().on("mousemove", (e: { offsetY: number }) => {
                pointer.y = e.offsetY;
            });
            drawn.getZr().on("globalout", () => {
                pointer.y = null;
            });
        }
        const report = () => {
            chart?.resize();
            if (chart && optionRef.current) makeRoomForLegend(chart, optionRef.current);
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
            if (pointer) {
                pointer.y = null;
                pointer.toPixelY = null;
                pointer.toPixelX = null;
                pointer.plotRect = null;
            }
        };
    }, []);

    const optionRef = useRef(option);
    optionRef.current = option;

    useEffect(() => {
        if (chartRef.current && option) {
            chartRef.current.setOption(option as any, { notMerge: true });
            makeRoomForLegend(chartRef.current, option);
        }
    }, [option]);

    return <div ref={ref} role="img" aria-label={label} style={{ position: "absolute", inset: 0 }} />;
};

export default EchartsView;
