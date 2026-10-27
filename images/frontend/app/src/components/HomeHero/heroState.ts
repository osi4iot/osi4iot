// Estado compartido entre la escena 3D de la página de inicio y los controles HTML que la acompañan.
import { create } from "zustand";

export type Concept = "twin" | "iot" | "industry" | "ai" | "fem";

export interface ConceptInfo {
    key: Concept;
    label: string;
    color: string;
    caption: string;
}

export const CONCEPTS: ConceptInfo[] = [
    {
        key: "twin",
        label: "Digital twins",
        color: "#4fe0c2",
        caption: "Each asset has a live 3D twin that moves with the data from its sensors.",
    },
    {
        key: "iot",
        label: "IoT",
        color: "#ffb547",
        caption: "Sensors publish their measurements over MQTT and NATS, and the platform stores them.",
    },
    {
        key: "industry",
        label: "Industry 4.0",
        color: "#6ea8ff",
        caption: "Buildings, floors and machines share one map, so every asset has its place on the floor.",
    },
    {
        key: "ai",
        label: "AI",
        color: "#b18cff",
        caption: "Pipelines run ML models and AI agents on the incoming data and act on the results.",
    },
    {
        key: "fem",
        label: "FEM results",
        color: "#ff6b8b",
        caption:
            "Finite element results are drawn on the 3D model: stress colours and exaggerated deformation show where the asset carries the load.",
    },
];

export const conceptColor = (key: Concept) => CONCEPTS.find((c) => c.key === key)!.color;

interface HeroState {
    focus: Concept | null;
    setFocus: (focus: Concept | null) => void;
    // contador de ráfagas de viento pedidas (clic en el aerogenerador); la escena reacciona a cada cambio
    gustRequested: number;
    requestGust: () => void;
    hoveredSensor: number | null;
    setHoveredSensor: (index: number | null) => void;
}

export const useHeroStore = create<HeroState>()((set) => ({
    focus: null,
    setFocus: (focus) => set({ focus }),
    gustRequested: 0,
    requestGust: () => set((s) => ({ gustRequested: s.gustRequested + 1 })),
    hoveredSensor: null,
    setHoveredSensor: (hoveredSensor) => set({ hoveredSensor }),
}));
