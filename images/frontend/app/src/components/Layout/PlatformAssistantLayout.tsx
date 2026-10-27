// Estructura de las páginas del asistente de la plataforma: barra superior, menú lateral con todas las
// capas y sus secciones (sustituye a la barra vertical de iconos, a las pestañas de cada capa y al título
// de la página) y el área de contenido.
//  - Escritorio: menú fijo a la izquierda, plegable a una columna de iconos (las secciones de cada capa
//    se muestran en un menú flotante al pasar el ratón).
//  - Móvil / ventanas estrechas: el menú se abre como un panel deslizante con el botón de la barra.
import { FC, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import styled, { css } from "styled-components";
import { ChevronDown, Menu, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { useMediaQuery } from "../../tools/useMediaQuery";
import { usePersistentState, useUiStore } from "../../state/uiStore";
import { useUserRole } from "../../state/sessionStore";
import { useEnsureUserRole } from "../../tools/useEnsureUserRole";
import {
    AppLogo,
    appFont,
    BarDivider,
    BarSpacer,
    IconButton,
    MOBILE_BREAKPOINT,
    shellColors as c,
    TOP_BAR_HEIGHT,
    TopBarRoot,
    UserMenu,
} from "./TopBar";
import {
    DIGITAL_TWIN_SECTION,
    isLayerVisible,
    LayerKey,
    layerByKey,
    NAV_LAYERS,
    NavLayer,
    NavSection,
    optionKey,
} from "./platformAssistantNav";

const SIDEBAR_WIDTH = 248;
const SIDEBAR_COLLAPSED_WIDTH = 64;
const CONTENT_PADDING = 12;
// Altura que ganan los formularios y tablas (calculados con 100vh) respecto a la estructura anterior:
// cabecera de 80px + título + pestañas = 220px; ahora barra de 56px + márgenes del contenido.
const HEIGHT_GAIN = 220 - (TOP_BAR_HEIGHT + 2 * CONTENT_PADDING + 2);

const COLLAPSED_STORAGE_KEY = "osi4iot.sidebarCollapsed";
const readCollapsed = () => {
    try {
        return localStorage.getItem(COLLAPSED_STORAGE_KEY) === "1";
    } catch {
        return false;
    }
};
const writeCollapsed = (value: boolean) => {
    try {
        localStorage.setItem(COLLAPSED_STORAGE_KEY, value ? "1" : "0");
    } catch {
        // sin almacenamiento: solo se pierde la preferencia
    }
};

const Shell = styled.div`
    height: 100vh;
    height: 100dvh;
    width: 100%;
    display: flex;
    flex-direction: column;
    background-color: ${c.page};
    color: ${c.text};
    font-family: ${appFont};
    overflow: hidden;
`;

const Body = styled.div`
    flex: 1;
    min-height: 0;
    display: flex;
`;

const Content = styled.main`
    flex: 1;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    padding: ${CONTENT_PADDING}px;
    --pa-gain: ${HEIGHT_GAIN}px;

    /* la tarjeta de contenido de cada capa */
    & > * {
        border-radius: 12px;
        border: 1px solid ${c.border};
    }

    @media (max-width: ${MOBILE_BREAKPOINT}px) {
        padding: 8px;
    }
`;

const scrollbar = css`
    &::-webkit-scrollbar {
        width: 8px;
    }
    &::-webkit-scrollbar-thumb {
        background: #2c3235;
        border-radius: 4px;
    }
    &::-webkit-scrollbar-track {
        background: transparent;
    }
`;

const Sidebar = styled.nav<{ $collapsed: boolean; $drawer: boolean; $open: boolean }>`
    flex-shrink: 0;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    background-color: ${c.bar};
    border-right: 1px solid ${c.border};
    font-family: ${appFont};
    user-select: none;

    ${({ $drawer, $open, $collapsed }) =>
        $drawer
            ? css`
                  position: fixed;
                  top: 0;
                  left: 0;
                  bottom: 0;
                  width: min(300px, 86vw);
                  z-index: 2000;
                  transform: translateX(${$open ? "0" : "-100%"});
                  transition: transform 0.22s ease;
                  box-shadow: ${$open ? "8px 0 32px rgba(0, 0, 0, 0.5)" : "none"};
                  visibility: ${$open ? "visible" : "hidden"};
                  transition:
                      transform 0.22s ease,
                      visibility 0.22s;
              `
            : css`
                  width: ${$collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH}px;
                  transition: width 0.18s ease;
              `}
`;

const SidebarScroll = styled.div<{ $collapsed: boolean }>`
    flex: 1;
    min-height: 0;
    padding: 10px 8px;
    overflow-y: ${({ $collapsed }) => ($collapsed ? "visible" : "auto")};
    overflow-x: ${({ $collapsed }) => ($collapsed ? "visible" : "hidden")};
    ${scrollbar}
`;

const DrawerHeader = styled.div`
    height: ${TOP_BAR_HEIGHT}px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 8px 0 6px;
    border-bottom: 1px solid ${c.border};
`;

const Backdrop = styled.div<{ $open: boolean }>`
    position: fixed;
    inset: 0;
    z-index: 1999;
    background-color: rgba(0, 0, 0, 0.55);
    opacity: ${({ $open }) => ($open ? 1 : 0)};
    pointer-events: ${({ $open }) => ($open ? "auto" : "none")};
    transition: opacity 0.22s ease;
`;

const LayerBlock = styled.div`
    & + & {
        margin-top: 4px;
    }
`;

const LayerHeader = styled.button<{ $active: boolean }>`
    width: 100%;
    height: 38px;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 10px;
    border: 0;
    border-radius: 9px;
    background: transparent;
    color: ${({ $active }) => ($active ? "#ffffff" : c.textSoft)};
    font: 500 13px ${appFont};
    letter-spacing: 0.01em;
    cursor: pointer;
    text-align: left;

    &:hover {
        background-color: ${c.hover};
        color: #ffffff;
    }

    &:focus-visible {
        outline: 2px solid ${c.accent};
        outline-offset: -2px;
    }

    & > svg:first-child {
        width: 18px;
        height: 18px;
        flex-shrink: 0;
        color: ${({ $active }) => ($active ? c.accent : "inherit")};
    }

    span {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
`;

const Chevron = styled(ChevronDown)<{ $expanded: boolean }>`
    width: 16px;
    height: 16px;
    flex-shrink: 0;
    color: ${c.textMuted};
    transform: rotate(${({ $expanded }) => ($expanded ? "0deg" : "-90deg")});
    transition: transform 0.15s ease;
`;

const SectionList = styled.ul`
    list-style: none;
    margin: 2px 0 6px 0;
    padding: 0 0 0 14px;
    position: relative;

    /* guía vertical que agrupa las secciones bajo su capa */
    &::before {
        content: "";
        position: absolute;
        left: 19px;
        top: 4px;
        bottom: 4px;
        width: 1px;
        background-color: rgba(255, 255, 255, 0.07);
    }
`;

const SectionButton = styled.button<{ $active: boolean }>`
    position: relative;
    width: 100%;
    height: 34px;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 10px 0 14px;
    border: 0;
    border-radius: 8px;
    background-color: ${({ $active }) => ($active ? c.accentSoft : "transparent")};
    color: ${({ $active }) => ($active ? "#ffffff" : c.textMuted)};
    font: ${({ $active }) => ($active ? 500 : 400)} 13px ${appFont};
    cursor: pointer;
    text-align: left;

    &:hover {
        background-color: ${({ $active }) => ($active ? c.accentSoft : c.hover)};
        color: #ffffff;
    }

    &:focus-visible {
        outline: 2px solid ${c.accent};
        outline-offset: -2px;
    }

    ${({ $active }) =>
        $active &&
        css`
            &::before {
                content: "";
                position: absolute;
                left: 0;
                top: 8px;
                bottom: 8px;
                width: 3px;
                border-radius: 2px;
                background-color: ${c.accent};
            }
        `}

    svg {
        width: 16px;
        height: 16px;
        flex-shrink: 0;
    }

    span {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
`;

// --- columna de iconos (menú plegado) ---
const RailItem = styled.div`
    position: relative;

    & + & {
        margin-top: 4px;
    }

    /* el menú flotante se abre al pasar el ratón y se cierra al salir; con el teclado, mientras el foco
       (visible) está dentro. No basta con :focus-within: tras un clic el botón conserva el foco y el menú
       se quedaba abierto aunque el ratón ya estuviera fuera. */
    &:hover:not([data-dismissed]) > div,
    &:has(:focus-visible) > div {
        display: block;
    }
`;

const RailButton = styled.button<{ $active: boolean }>`
    width: 46px;
    height: 42px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 0;
    border-radius: 10px;
    background-color: ${({ $active }) => ($active ? c.accentSoft : "transparent")};
    color: ${({ $active }) => ($active ? "#ffffff" : c.textSoft)};
    cursor: pointer;

    &:hover {
        background-color: ${({ $active }) => ($active ? c.accentSoft : c.hover)};
        color: #ffffff;
    }

    &:focus-visible {
        outline: 2px solid ${c.accent};
        outline-offset: -2px;
    }

    svg {
        width: 20px;
        height: 20px;
        color: ${({ $active }) => ($active ? c.accent : "inherit")};
    }
`;

// el relleno izquierdo hace de puente para que el menú no se cierre al mover el ratón hacia él
const Flyout = styled.div`
    display: none;
    position: absolute;
    left: 100%;
    top: -6px;
    padding-left: 10px;
    z-index: 1500;
`;

const FlyoutPanel = styled.div`
    min-width: 210px;
    padding: 6px;
    background-color: rgba(20, 22, 26, 0.98);
    border: 1px solid ${c.border};
    border-radius: 12px;
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);

    ul {
        list-style: none;
        margin: 0;
        padding: 0;
    }
`;

const FlyoutTitle = styled.div`
    padding: 6px 10px 8px;
    font: 500 11px ${appFont};
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: ${c.textMuted};
`;

// --- ruta de la sección en la barra superior ---
const Breadcrumb = styled.div`
    display: flex;
    align-items: baseline;
    gap: 8px;
    min-width: 0;
    font-family: ${appFont};
    white-space: nowrap;
`;

const CrumbLayer = styled.span`
    font-size: 13px;
    color: ${c.textMuted};

    &::after {
        content: "/";
        margin-left: 8px;
        color: rgba(255, 255, 255, 0.2);
    }

    @media (max-width: ${MOBILE_BREAKPOINT}px) {
        display: none;
    }
`;

const CrumbSection = styled.span`
    font-size: 15px;
    font-weight: 500;
    color: ${c.text};
    overflow: hidden;
    text-overflow: ellipsis;
`;

const currentOptionOf = (layer: NavLayer) =>
    (useUiStore.getState().values[optionKey(layer.key)] as string | undefined) ?? layer.defaultOption;

const useLayerOption = (layer: NavLayer) =>
    useUiStore((state) => (state.values[optionKey(layer.key)] as string | undefined) ?? layer.defaultOption);

interface PlatformAssistantLayoutProps {
    layer: LayerKey;
    children: ReactNode;
}

const PlatformAssistantLayout: FC<PlatformAssistantLayoutProps> = ({ layer: activeLayerKey, children }) => {
    useEnsureUserRole();
    const navigate = useNavigate();
    const userRole = useUserRole();
    const isNarrow = useMediaQuery(`(max-width: ${MOBILE_BREAKPOINT}px)`);
    const [collapsed, setCollapsed] = useState(readCollapsed);
    const [drawerOpen, setDrawerOpen] = useState(false);
    // menú flotante cerrado tras elegir una sección, hasta que el ratón vuelve a entrar en la capa
    const [dismissedFlyout, setDismissedFlyout] = useState<LayerKey | null>(null);
    // capas desplegadas en el menú (por defecto solo la activa); se conserva al cambiar de capa
    const [expandedLayers, setExpandedLayers] = usePersistentState<Partial<Record<LayerKey, boolean>>>(
        "shell.expandedLayers",
        {},
    );

    const hasOpenDigitalTwin = useUiStore((state) => state.values["home.digitalTwinGltfData"] != null);
    const openDigitalTwinName = useUiStore((state) => {
        const dt = state.values["home.digitalTwinSelected"] as { description?: string; digitalTwinUid?: string } | null;
        return dt?.description || dt?.digitalTwinUid || "";
    });

    const layers = useMemo(
        () =>
            NAV_LAYERS.filter((layer) => isLayerVisible(layer, userRole)).map((layer) => {
                if (layer.key !== "home" || !hasOpenDigitalTwin) return layer;
                const [geolocation, ...rest] = layer.sections;
                return { ...layer, sections: [geolocation, DIGITAL_TWIN_SECTION, ...rest] };
            }),
        [userRole, hasOpenDigitalTwin],
    );

    const activeLayer = layers.find((layer) => layer.key === activeLayerKey) ?? layerByKey(activeLayerKey);
    const activeOption = useLayerOption(activeLayer);
    const activeSection = activeLayer.sections.find((section) => section.option === activeOption);

    const isExpanded = (key: LayerKey) => expandedLayers[key] ?? key === activeLayerKey;
    const toggleLayer = (key: LayerKey) => setExpandedLayers((prev) => ({ ...prev, [key]: !(prev[key] ?? key === activeLayerKey) }));

    const goTo = useCallback(
        (layer: NavLayer, option: string) => {
            useUiStore.getState().setValue(optionKey(layer.key), option);
            if (layer.key !== activeLayerKey) navigate(layer.route);
            setDrawerOpen(false);
        },
        [activeLayerKey, navigate],
    );

    const toggleCollapsed = () =>
        setCollapsed((value) => {
            writeCollapsed(!value);
            return !value;
        });

    useEffect(() => {
        if (!isNarrow) setDrawerOpen(false);
    }, [isNarrow]);

    useEffect(() => {
        if (!drawerOpen) return;
        const onKeyDown = (event: KeyboardEvent) => event.key === "Escape" && setDrawerOpen(false);
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [drawerOpen]);

    useEffect(() => {
        document.title = activeSection ? `${activeSection.label} · ${activeLayer.label}` : activeLayer.label;
    }, [activeSection, activeLayer]);

    const sectionLabel = (layer: NavLayer, section: NavSection) =>
        layer.key === "home" && section === DIGITAL_TWIN_SECTION && openDigitalTwinName
            ? `${section.label} · ${openDigitalTwinName}`
            : section.label;

    const renderSections = (layer: NavLayer, currentOption: string) =>
        layer.sections.map((section) => {
            const isActive = layer.key === activeLayerKey && section.option === currentOption;
            const Icon = section.icon;
            const label = sectionLabel(layer, section);
            return (
                <li key={section.option}>
                    <SectionButton
                        type="button"
                        $active={isActive}
                        aria-current={isActive ? "page" : undefined}
                        title={label}
                        onClick={() => {
                            goTo(layer, section.option);
                            // al elegir una sección el menú flotante se cierra aunque el ratón siga encima
                            setDismissedFlyout(layer.key);
                            (document.activeElement as HTMLElement | null)?.blur();
                        }}
                    >
                        <Icon aria-hidden />
                        <span>{label}</span>
                    </SectionButton>
                </li>
            );
        });

    const railMode = !isNarrow && collapsed;

    const menu = railMode ? (
        <SidebarScroll $collapsed>
            {layers.map((layer) => {
                const Icon = layer.icon;
                const isActive = layer.key === activeLayerKey;
                return (
                    <RailItem
                        key={layer.key}
                        data-dismissed={dismissedFlyout === layer.key ? "" : undefined}
                        onMouseEnter={() => dismissedFlyout && setDismissedFlyout(null)}
                        onMouseLeave={() => dismissedFlyout && setDismissedFlyout(null)}
                    >
                        <RailButton
                            type="button"
                            $active={isActive}
                            aria-label={layer.label}
                            onClick={() => goTo(layer, currentOptionOf(layer))}
                        >
                            <Icon aria-hidden />
                        </RailButton>
                        <Flyout>
                            <FlyoutPanel>
                                <FlyoutTitle>{layer.label}</FlyoutTitle>
                                <ul>{renderSections(layer, activeOption)}</ul>
                            </FlyoutPanel>
                        </Flyout>
                    </RailItem>
                );
            })}
        </SidebarScroll>
    ) : (
        <SidebarScroll $collapsed={false}>
            {layers.map((layer) => {
                const Icon = layer.icon;
                const expanded = isExpanded(layer.key);
                return (
                    <LayerBlock key={layer.key}>
                        <LayerHeader
                            type="button"
                            $active={layer.key === activeLayerKey}
                            aria-expanded={expanded}
                            onClick={() => toggleLayer(layer.key)}
                        >
                            <Icon aria-hidden />
                            <span>{layer.label}</span>
                            <Chevron $expanded={expanded} aria-hidden />
                        </LayerHeader>
                        {expanded && <SectionList>{renderSections(layer, activeOption)}</SectionList>}
                    </LayerBlock>
                );
            })}
        </SidebarScroll>
    );

    return (
        <Shell>
            <TopBarRoot>
                {isNarrow ? (
                    <IconButton type="button" onClick={() => setDrawerOpen(true)} aria-label="Open menu" title="Menu">
                        <Menu />
                    </IconButton>
                ) : (
                    <IconButton
                        type="button"
                        onClick={toggleCollapsed}
                        aria-label={collapsed ? "Expand menu" : "Collapse menu"}
                        title={collapsed ? "Expand menu" : "Collapse menu"}
                    >
                        {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
                    </IconButton>
                )}
                <AppLogo showName={!isNarrow} compact={isNarrow} />
                <BarDivider />
                <Breadcrumb>
                    <CrumbLayer>{activeLayer.label}</CrumbLayer>
                    <CrumbSection>
                        {activeSection ? sectionLabel(activeLayer, activeSection) : activeLayer.label}
                    </CrumbSection>
                </Breadcrumb>
                <BarSpacer />
                <UserMenu />
            </TopBarRoot>
            <Body>
                {isNarrow && <Backdrop $open={drawerOpen} onClick={() => setDrawerOpen(false)} />}
                <Sidebar
                    $collapsed={railMode}
                    $drawer={isNarrow}
                    $open={drawerOpen}
                    aria-label="Platform assistant menu"
                >
                    {isNarrow && (
                        <DrawerHeader>
                            <AppLogo showName={false} />
                            <IconButton type="button" onClick={() => setDrawerOpen(false)} aria-label="Close menu">
                                <X />
                            </IconButton>
                        </DrawerHeader>
                    )}
                    {menu}
                </Sidebar>
                <Content>{children}</Content>
            </Body>
        </Shell>
    );
};

export default PlatformAssistantLayout;
