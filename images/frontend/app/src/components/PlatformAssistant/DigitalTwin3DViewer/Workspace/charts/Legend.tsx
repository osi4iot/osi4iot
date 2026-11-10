// The legend of a chart, as Grafana's: a list or a table (with calculations: mean, max, last…), below or
// to the right. A click on a series shows only that one; another click shows all again.
import { FC } from "react";
import styled from "styled-components";
import { scrollbarStyle } from "../../../../Tools/FormTools";
import { ChartSettings, DrawSeries, formatWithUnit, getPath, reduceBuckets, reducerName } from "./chartConfig";

const List = styled.ul<{ $right: boolean }>`
    margin: 0;
    padding: 2px 0 0;
    list-style: none;
    display: flex;
    flex-wrap: wrap;
    flex-direction: ${({ $right }) => ($right ? "column" : "row")};
    gap: ${({ $right }) => ($right ? "4px" : "4px 14px")};
    font-size: 12px;
    color: #c7cbd1;
    max-height: ${({ $right }) => ($right ? "none" : "64px")};
    overflow: auto;
    ${scrollbarStyle}
`;

const LegendScroll = styled.div`
    flex: none;
    overflow: auto;
    ${scrollbarStyle}
`;

const Item = styled.button<{ $dim: boolean }>`
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 2px 0;
    background: none;
    border: none;
    color: inherit;
    font: inherit;
    cursor: pointer;
    opacity: ${({ $dim }) => ($dim ? 0.45 : 1)};
    text-align: left;

    &:focus-visible {
        outline: 2px solid #3d82f0;
    }
`;

const Swatch = styled.span<{ $color: string }>`
    width: 14px;
    height: 4px;
    flex: none;
    border-radius: 2px;
    background: ${({ $color }) => $color};
`;

const Table = styled.table`
    border-collapse: collapse;
    font-size: 12px;
    color: #c7cbd1;

    th {
        padding: 3px 8px;
        color: #9aa1aa;
        font-weight: 600;
        text-align: right;
        white-space: nowrap;
    }

    th:first-child {
        text-align: left;
    }

    td {
        padding: 2px 8px;
        text-align: right;
        white-space: nowrap;
    }

    td:first-child {
        text-align: left;
    }
`;

export interface LegendProps {
    series: DrawSeries[];
    settings: ChartSettings;
    hidden: Set<string>;
    onToggle: (key: string) => void;
    // Pie chart: the total, for the "percent" value
    percentOf?: number;
}

export const legendSettings = (settings: ChartSettings) => {
    const show = getPath(settings.options, "legend.showLegend") !== false && getPath(settings.options, "legend.displayMode") !== "hidden";
    const mode = String(getPath(settings.options, "legend.displayMode") ?? "list");
    const placement = String(getPath(settings.options, "legend.placement") ?? "bottom");
    const calcs = (getPath(settings.options, "legend.calcs") as string[] | undefined) ?? [];
    return { show, mode, placement, calcs };
};

const Legend: FC<LegendProps> = ({ series, settings, hidden, onToggle, percentOf }) => {
    const { mode, placement, calcs } = legendSettings(settings);
    const right = placement === "right";
    const shown = series.filter((s) => !s.hidden && !s.hideFromLegend);
    const decimals = settings.fieldConfig.defaults.decimals;
    const calcText = (s: DrawSeries, c: string) => {
        if (c === "percent") {
            const v = reduceBuckets(s.buckets, String((getPath(settings.options, "reduceOptions.calcs") as string[] | undefined)?.[0] ?? "lastNotNull"));
            return percentOf ? `${((100 * Math.abs(v ?? 0)) / percentOf).toFixed(1)}%` : "-";
        }
        return formatWithUnit(reduceBuckets(s.buckets, c), s.unit, s.field.decimals ?? decimals, "-");
    };
    const calcName = (c: string) => (c === "percent" ? "Percent" : percentOf !== undefined ? "Value" : reducerName(c));
    if (mode === "table") {
        return (
            <LegendScroll style={{ maxHeight: right ? "100%" : 120, maxWidth: right ? "45%" : "100%" }}>
                <Table aria-label="Legend">
                    <thead>
                        <tr>
                            <th scope="col">Name</th>
                            {calcs.map((c) => (
                                <th scope="col" key={c}>
                                    {calcName(c)}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {shown.map((s) => (
                            <tr key={s.key}>
                                <td>
                                    <Item type="button" $dim={hidden.has(s.key)} onClick={() => onToggle(s.key)}>
                                        <Swatch $color={s.color} aria-hidden="true" />
                                        {s.name}
                                    </Item>
                                </td>
                                {calcs.map((c) => (
                                    <td key={c}>{calcText(s, c)}</td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </Table>
            </LegendScroll>
        );
    }
    return (
        <List $right={right} aria-label="Legend" style={{ flex: "none", maxWidth: right ? "40%" : "100%" }}>
            {shown.map((s) => (
                <li key={s.key}>
                    <Item type="button" $dim={hidden.has(s.key)} onClick={() => onToggle(s.key)}>
                        <Swatch $color={s.color} aria-hidden="true" />
                        {s.name}
                        {calcs.length > 0 && (
                            <span style={{ color: "#9aa1aa" }}>
                                {calcs.map((c) => `${calcName(c)}: ${calcText(s, c)}`).join("  ")}
                            </span>
                        )}
                    </Item>
                </li>
            ))}
        </List>
    );
};

export default Legend;
