// Aggregated series of sensor fields, from admin_api (/time_series): mean, min and max per bucket of time.
import { axiosAuth } from "../../../../tools/tools";
import { getAxiosInstance } from "../../../../tools/axiosIntance";
import { DOMAIN_NAME, PROTOCOL } from "../Utils/constants";
import { ApiAuth } from "./viewerLayoutApi";
import { TimeSeriesResponse } from "./chartSeries";

export interface TimeSeriesQuery {
    groupId: number;
    series: { sensorId: number; field: string; index?: number }[];
    from: number;
    to: number;
    points: number;
    // the minimum interval (Grafana's "Min interval"): 1m, 1h…
    interval?: string;
    // the Histogram panel: bins of the values instead of intervals of time
    histogram?: { bins: number; size?: number; offset?: number };
}

export const timeSeriesUrl = ({ groupId, series, from, to, points, interval, histogram }: TimeSeriesQuery) => {
    const params = new URLSearchParams({
        series: JSON.stringify(series.map(({ sensorId, field, index }) => (index === undefined ? { sensorId, field } : { sensorId, field, index }))),
        from: String(Math.round(from)),
        to: String(Math.round(to)),
        points: String(Math.round(points)),
    });
    if (interval) params.set("interval", interval);
    if (histogram) {
        params.set("histogram", String(histogram.bins));
        if (histogram.size) params.set("bucketSize", String(histogram.size));
        if (histogram.offset) params.set("bucketOffset", String(histogram.offset));
    }
    return `${PROTOCOL}://${DOMAIN_NAME}/admin_api/time_series/${groupId}?${params.toString()}`;
};

export const fetchTimeSeries = async (
    query: TimeSeriesQuery,
    { accessToken, refreshToken, authDispatch }: ApiAuth,
    signal?: AbortSignal,
): Promise<TimeSeriesResponse> => {
    const config = { ...(axiosAuth(accessToken) as object), signal };
    const response = await getAxiosInstance(refreshToken, authDispatch).get(timeSeriesUrl(query), config as any);
    return response.data as TimeSeriesResponse;
};
