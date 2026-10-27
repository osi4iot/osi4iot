// Datos de la sesión del usuario (Zustand): rol y número de elementos que gestiona, y las pestañas de
// dashboards abiertas. Sustituye a la parte no tabular de PlatformAssistantContext.
import { create } from "zustand";

export interface UserRoleData {
    userRole: string;
    numOrganizationManaged: number;
    numGroupsManaged: number;
    numAssetTypesManaged: number;
    numAssetsManaged: number;
    numSensorsManaged: number;
    numDigitalTwinsManaged: number;
    numMLModelsManaged: number;
}

interface SessionState extends UserRoleData {
    windowObjectReferences: Record<string, Window | null>;
    setUserRole: (data: Partial<UserRoleData>) => void;
    setWindowObjectReferences: (refs: Record<string, Window | null>) => void;
    reset: () => void;
}

const initialSession: UserRoleData & { windowObjectReferences: Record<string, Window | null> } = {
    userRole: "unknown",
    numOrganizationManaged: 0,
    numGroupsManaged: 0,
    numAssetTypesManaged: 0,
    numAssetsManaged: 0,
    numSensorsManaged: 0,
    numDigitalTwinsManaged: 0,
    numMLModelsManaged: 0,
    windowObjectReferences: {},
};

export const useSessionStore = create<SessionState>()((set) => ({
    ...initialSession,
    setUserRole: (data) => set({ ...data }),
    setWindowObjectReferences: (windowObjectReferences) => set({ windowObjectReferences }),
    reset: () => set({ ...initialSession }),
}));

export const useUserRole = () => useSessionStore((s) => s.userRole);
export const useIsPlatformAdmin = () => useSessionStore((s) => s.userRole === "PlatformAdmin");
export const useIsOrgAdmin = () => useSessionStore((s) => s.userRole === "OrgAdmin");
export const useIsGroupAdmin = () => useSessionStore((s) => s.userRole === "GroupAdmin");
export const useWindowObjectReferences = () => useSessionStore((s) => s.windowObjectReferences);
