// src/vite-env.d.ts  (Vite ya lo crea automáticamente)
/// <reference types="vite/client" />

// ECharts GL has no types: the two parts the 3D Surface panels install (surface/SurfaceChart.tsx)
declare module "echarts-gl/lib/chart/surface/install" {
    import type { EChartsExtensionInstaller } from "echarts/types/dist/shared";
    export const install: EChartsExtensionInstaller;
}
declare module "echarts-gl/lib/component/grid3D/install" {
    import type { EChartsExtensionInstaller } from "echarts/types/dist/shared";
    export const install: EChartsExtensionInstaller;
}

