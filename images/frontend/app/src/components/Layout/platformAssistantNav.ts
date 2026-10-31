// Menú lateral del asistente de la plataforma: capas (Home, User, Group admin, Organization admin,
// Platform admin) con sus secciones. La sección abierta de cada capa vive en el almacén de la interfaz
// ("<capa>.optionToShow"), el mismo valor que lee cada capa; así el menú y la capa siempre coinciden.
import {
    BookOpen,
    BookOpenText,
    Box,
    BrainCircuit,
    Building,
    ChartLine,
    Cpu,
    Globe,
    HardDrive,
    House,
    IdCard,
    KeyRound,
    Landmark,
    Layers,
    LayoutDashboard,
    LucideIcon,
    MapPin,
    Package,
    Rss,
    Shapes,
    ShieldCheck,
    Sparkles,
    Tags,
    UserPlus,
    UserRound,
    Users,
    UsersRound,
    Wrench,
} from "lucide-react";
import {
    GROUP_ADMIN_OPTIONS,
    ORG_ADMIN_OPTIONS,
    PLATFORM_ADMIN_OPTIONS,
    PLATFORM_ASSISTANT_HOME_OPTIONS,
    PLATFORM_ASSISTANT_ROUTES,
    USER_OPTIONS,
} from "../PlatformAssistant/Utils/platformAssistantOptions";

export type LayerKey = "home" | "user" | "group" | "org" | "admin";

export interface NavSection {
    option: string;
    label: string;
    icon: LucideIcon;
}

export interface NavLayer {
    key: LayerKey;
    label: string;
    icon: LucideIcon;
    route: string;
    defaultOption: string;
    sections: NavSection[];
    // roles que pueden ver la capa (vacío: todos)
    roles: string[];
}

export const optionKey = (layer: LayerKey) => `${layer}.optionToShow`;

export const NAV_LAYERS: NavLayer[] = [
    {
        key: "home",
        label: "Home",
        icon: House,
        route: PLATFORM_ASSISTANT_ROUTES.HOME,
        defaultOption: PLATFORM_ASSISTANT_HOME_OPTIONS.GEOLOCATION,
        roles: [],
        sections: [
            { option: PLATFORM_ASSISTANT_HOME_OPTIONS.GEOLOCATION, label: "Geolocation", icon: MapPin },
            // "Digital twin" se añade mientras hay un gemelo digital abierto (ver PlatformAssistantLayout)
            { option: PLATFORM_ASSISTANT_HOME_OPTIONS.TUTORIAL, label: "Tutorial", icon: BookOpen },
        ],
    },
    {
        key: "user",
        label: "User",
        icon: UserRound,
        route: PLATFORM_ASSISTANT_ROUTES.USER,
        defaultOption: USER_OPTIONS.USER_PROFILE,
        roles: [],
        sections: [
            { option: USER_OPTIONS.USER_PROFILE, label: "User profile", icon: IdCard },
            { option: USER_OPTIONS.MEMBERSHIP_IN_ORGS, label: "Membership in orgs", icon: Landmark },
            { option: USER_OPTIONS.MEMBERSHIP_IN_GROUPS, label: "Membership in groups", icon: Users },
        ],
    },
    {
        key: "group",
        label: "Group admin",
        icon: Users,
        route: PLATFORM_ASSISTANT_ROUTES.GROUP_ADMIN,
        defaultOption: GROUP_ADMIN_OPTIONS.GROUPS_MANAGED,
        roles: ["GroupAdmin", "OrgAdmin", "PlatformAdmin"],
        sections: [
            { option: GROUP_ADMIN_OPTIONS.GROUPS_MANAGED, label: "Groups managed", icon: UsersRound },
            { option: GROUP_ADMIN_OPTIONS.GROUP_MEMBERS, label: "Group members", icon: UserPlus },
            { option: GROUP_ADMIN_OPTIONS.ASSETS, label: "Assets", icon: Package },
            { option: GROUP_ADMIN_OPTIONS.SENSORS, label: "Sensors", icon: Cpu },
            { option: GROUP_ADMIN_OPTIONS.TOPICS, label: "Topics", icon: Rss },
            { option: GROUP_ADMIN_OPTIONS.MEASUREMENTS, label: "Measurements", icon: ChartLine },
            { option: GROUP_ADMIN_OPTIONS.S3_STORAGE, label: "S3 storage", icon: HardDrive },
            { option: GROUP_ADMIN_OPTIONS.DASHBOARDS, label: "Dashboards", icon: LayoutDashboard },
            { option: GROUP_ADMIN_OPTIONS.DIGITAL_TWINS, label: "Digital twins", icon: Box },
            { option: GROUP_ADMIN_OPTIONS.KNOWLEDGE, label: "Knowledge", icon: BookOpenText },
            { option: GROUP_ADMIN_OPTIONS.SKILLS, label: "Skills", icon: Sparkles },
            { option: GROUP_ADMIN_OPTIONS.ML_MODELS, label: "ML models", icon: BrainCircuit },
        ],
    },
    {
        key: "org",
        label: "Organization admin",
        icon: Landmark,
        route: PLATFORM_ASSISTANT_ROUTES.ORG_ADMIN,
        defaultOption: ORG_ADMIN_OPTIONS.ORGS_MANAGED,
        roles: ["OrgAdmin", "PlatformAdmin"],
        sections: [
            { option: ORG_ADMIN_OPTIONS.ORGS_MANAGED, label: "Orgs managed", icon: Landmark },
            { option: ORG_ADMIN_OPTIONS.ORG_USERS, label: "Org users", icon: Users },
            { option: ORG_ADMIN_OPTIONS.GROUPS, label: "Groups", icon: UsersRound },
            { option: ORG_ADMIN_OPTIONS.SENSOR_TYPES, label: "Sensor types", icon: Tags },
            { option: ORG_ADMIN_OPTIONS.ASSET_TYPES, label: "Asset types", icon: Shapes },
        ],
    },
    {
        key: "admin",
        label: "Platform admin",
        icon: ShieldCheck,
        route: PLATFORM_ASSISTANT_ROUTES.PLATFORM_ADMIN,
        defaultOption: PLATFORM_ADMIN_OPTIONS.BUILDINGS,
        roles: ["PlatformAdmin"],
        sections: [
            { option: PLATFORM_ADMIN_OPTIONS.BUILDINGS, label: "Buildings", icon: Building },
            { option: PLATFORM_ADMIN_OPTIONS.FLOORS, label: "Floors", icon: Layers },
            { option: PLATFORM_ADMIN_OPTIONS.ORGS, label: "Organizations", icon: Landmark },
            { option: PLATFORM_ADMIN_OPTIONS.GLOBAL_USERS, label: "Global users", icon: Globe },
            { option: PLATFORM_ADMIN_OPTIONS.REFRESH_TOKENS, label: "Refresh tokens", icon: KeyRound },
            { option: PLATFORM_ADMIN_OPTIONS.SKILLS, label: "Skills", icon: Sparkles },
            { option: PLATFORM_ADMIN_OPTIONS.TOOLS, label: "Tools", icon: Wrench },
        ],
    },
];

export const DIGITAL_TWIN_SECTION: NavSection = {
    option: PLATFORM_ASSISTANT_HOME_OPTIONS.DIGITAL_TWINS,
    label: "Digital twin",
    icon: Box,
};

export const layerByKey = (key: LayerKey) => NAV_LAYERS.find((layer) => layer.key === key)!;

export const isLayerVisible = (layer: NavLayer, userRole: string) =>
    layer.roles.length === 0 || layer.roles.includes(userRole);
