import { describe, expect, it } from "vitest";
import { sanitizeCharts } from "./chatCharts";

describe("sanitizeCharts", () => {
    it("keeps valid PNG charts", () => {
        const charts = sanitizeCharts([{ title: "Az", mimeType: "image/png", data: "iVBORw0KGgo=" }]);
        expect(charts).toEqual([{ title: "Az", mimeType: "image/png", data: "iVBORw0KGgo=" }]);
    });

    it("drops anything that is not a base64 image", () => {
        expect(sanitizeCharts(undefined)).toEqual([]);
        expect(sanitizeCharts("x")).toEqual([]);
        expect(
            sanitizeCharts([
                { title: "svg", mimeType: "image/svg+xml", data: "PHN2Zz4=" },
                { title: "html", mimeType: "text/html", data: "PGI+" },
                { title: "inject", mimeType: "image/png", data: 'x" onerror="alert(1)' },
                { title: "empty", mimeType: "image/png", data: "" },
                null,
            ])
        ).toEqual([]);
    });

    it("keeps the references of the stored conversation, to ask for their images", () => {
        expect(sanitizeCharts([{ id: "chart_0123456789abcdef01234567", title: "Az" }])).toEqual([
            { id: "chart_0123456789abcdef01234567", title: "Az", mimeType: "", data: "" },
        ]);
        expect(sanitizeCharts([{ id: "../etc", title: "x" }])).toEqual([]);
    });

    it("keeps at most four", () => {
        const one = { title: "", mimeType: "image/png", data: "AAAA" };
        expect(sanitizeCharts([one, one, one, one, one])).toHaveLength(4);
    });
});
