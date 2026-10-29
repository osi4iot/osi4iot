import { Component, FC, lazy, ReactNode, Suspense, useMemo, useState } from "react";
import { NavLink } from "react-router";
import styled, { css } from "styled-components";
import { FaGithub } from "react-icons/fa";
import "@fontsource-variable/archivo/standard.css";
import Header from "../components/Layout/Header";
import { TOP_BAR_HEIGHT } from "../components/Layout/TopBar";
import { getDomainName, getProtocol } from "../tools/tools";
import { useMediaQuery } from "../tools/useMediaQuery";
import { scrollbarStyle } from "../components/Tools/FormTools";
import { Concept, CONCEPTS, useHeroStore } from "../components/HomeHero/heroState";

// La escena 3D (three.js, postprocesado) se descarga aparte para no retrasar el resto de la aplicación
const HeroScene = lazy(() => import("../components/HomeHero/HeroScene"));

const NARROW = 900;
const display = `"Archivo Variable", Roboto, "Helvetica Neue", Arial, sans-serif`;
const text = `Roboto, "Helvetica Neue", Arial, sans-serif`;

const colors = {
    page: "#070a10",
    ink: "#eef2f7",
    muted: "#a7b1be",
    faint: "#6f7a88",
    line: "rgba(255, 255, 255, 0.12)",
    accent: "#3d82f0",
    accentHover: "#5694f7",
};

const Page = styled.main`
    position: relative;
    height: calc(100vh - ${TOP_BAR_HEIGHT}px);
    height: calc(100dvh - ${TOP_BAR_HEIGHT}px);
    background-color: ${colors.page};
    color: ${colors.ink};
    overflow: hidden;

    /* barra de desplazamiento (pantallas estrechas) con el estilo del resto de la plataforma */
    ${scrollbarStyle}

    @media (max-width: ${NARROW}px) {
        overflow-y: auto;
        overflow-x: hidden;
    }
`;

const Stage = styled.div`
    position: absolute;
    inset: 0;

    /* el texto se lee sobre la escena gracias a un degradado a la izquierda */
    &::after {
        content: "";
        position: absolute;
        inset: 0;
        pointer-events: none;
        background:
            linear-gradient(90deg, rgba(7, 10, 16, 0.94) 0%, rgba(7, 10, 16, 0.7) 30%, rgba(7, 10, 16, 0) 52%),
            linear-gradient(0deg, rgba(7, 10, 16, 0.85) 0%, rgba(7, 10, 16, 0) 22%);
    }

    @media (max-width: ${NARROW}px) {
        position: relative;
        inset: auto;
        height: 58vh;
        min-height: 360px;

        &::after {
            background: linear-gradient(0deg, rgba(7, 10, 16, 1) 0%, rgba(7, 10, 16, 0) 30%);
        }
    }
`;

const Fallback = styled.div`
    position: absolute;
    inset: 0;
    background:
        radial-gradient(60% 60% at 70% 45%, rgba(61, 130, 240, 0.25), transparent 70%),
        url("/osi4iot_fond.jpg") center / cover no-repeat;
`;

const Intro = styled.section`
    position: absolute;
    z-index: 2;
    left: clamp(24px, 6vw, 96px);
    top: 46%;
    transform: translateY(-50%);
    width: min(540px, 44vw);

    @media (max-width: ${NARROW}px) {
        position: relative;
        left: auto;
        top: auto;
        transform: none;
        width: auto;
        margin-top: -28px;
        padding: 0 20px;
    }
`;

const Headline = styled.h1`
    margin: 0 0 20px;
    font-family: ${display};
    font-stretch: 116%;
    font-weight: 760;
    font-size: clamp(34px, 4.4vw, 66px);
    line-height: 1.02;
    letter-spacing: -0.012em;
    color: ${colors.ink};
    text-wrap: balance;
`;

const Lead = styled.p`
    margin: 0 0 32px;
    max-width: 46ch;
    font: 400 17px/1.55 ${text};
    color: ${colors.muted};

    @media (max-width: ${NARROW}px) {
        font-size: 16px;
        margin-bottom: 24px;
    }
`;

const Actions = styled.nav`
    display: flex;
    flex-wrap: wrap;
    gap: 10px 12px;
`;

const buttonBase = css`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 44px;
    padding: 0 18px;
    border-radius: 12px;
    font: 600 15px ${display};
    font-stretch: 104%;
    text-decoration: none;
    cursor: pointer;
    transition:
        background-color 0.15s ease,
        border-color 0.15s ease,
        color 0.15s ease;

    &:focus-visible {
        outline: 2px solid ${colors.accentHover};
        outline-offset: 3px;
    }
`;

const PrimaryLink = styled(NavLink)`
    ${buttonBase}
    flex-basis: 100%;
    min-height: 52px;
    font-size: 17px;
    color: #ffffff;
    background-color: ${colors.accent};
    border: 1px solid ${colors.accent};

    &:hover {
        background-color: ${colors.accentHover};
    }
`;

const secondary = css`
    ${buttonBase}
    flex: 1 1 auto;
    white-space: nowrap;
    color: ${colors.ink};
    background-color: rgba(255, 255, 255, 0.04);
    border: 1px solid ${colors.line};
    backdrop-filter: blur(6px);

    &:hover {
        border-color: rgba(255, 255, 255, 0.35);
        background-color: rgba(255, 255, 255, 0.08);
    }

    small {
        font: 400 12px ${text};
        color: ${colors.faint};
    }
`;

const SecondaryLink = styled(NavLink)`
    ${secondary}
`;

const SecondaryButton = styled.button`
    ${secondary}
`;

// --- conceptos que resaltan su parte de la escena ---
const Concepts = styled.div`
    position: absolute;
    z-index: 2;
    left: clamp(24px, 6vw, 96px);
    bottom: 28px;
    max-width: min(620px, 60vw);

    @media (max-width: ${NARROW}px) {
        position: relative;
        left: auto;
        bottom: auto;
        max-width: none;
        padding: 28px 20px 0;
    }
`;

const ConceptList = styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
`;

const ConceptButton = styled.button<{ $color: string; $active: boolean }>`
    display: inline-flex;
    align-items: center;
    gap: 8px;
    height: 36px;
    padding: 0 14px 0 12px;
    border-radius: 999px;
    border: 1px solid ${({ $active, $color }) => ($active ? $color : colors.line)};
    background-color: ${({ $active, $color }) => ($active ? `${$color}22` : "rgba(7, 10, 16, 0.55)")};
    color: ${({ $active }) => ($active ? "#ffffff" : colors.muted)};
    font: 500 14px ${text};
    cursor: pointer;
    backdrop-filter: blur(6px);

    &::before {
        content: "";
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: ${({ $color }) => $color};
        box-shadow: 0 0 ${({ $active }) => ($active ? "12px" : "0")} ${({ $color }) => $color};
    }

    &:hover {
        color: #ffffff;
        border-color: ${({ $color }) => $color};
    }

    &:focus-visible {
        outline: 2px solid ${({ $color }) => $color};
        outline-offset: 2px;
    }
`;

const Caption = styled.p`
    margin: 12px 0 0;
    min-height: 2.9em;
    max-width: 60ch;
    font: 400 14px/1.45 ${text};
    color: ${colors.muted};
`;

// --- pie: cómo interactuar, código fuente y créditos ---
const Aside = styled.footer`
    position: absolute;
    z-index: 2;
    right: clamp(24px, 4vw, 64px);
    bottom: 28px;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 10px;
    text-align: right;
    font: 400 12px/1.5 ${text};
    color: ${colors.faint};

    @media (max-width: ${NARROW}px) {
        position: relative;
        right: auto;
        bottom: auto;
        align-items: flex-start;
        text-align: left;
        padding: 28px 20px 32px;
    }
`;

const Hint = styled.p`
    margin: 0;
    max-width: 30ch;
    font-size: 13px;
    color: ${colors.muted};
`;

const Credits = styled.div`
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    align-items: center;
    gap: 6px 12px;

    @media (max-width: ${NARROW}px) {
        justify-content: flex-start;
    }

    a {
        color: inherit;
        text-decoration: none;
    }

    a:hover {
        color: ${colors.ink};
    }
`;

const GithubLink = styled.a`
    display: inline-flex;
    color: ${colors.muted} !important;

    svg {
        width: 22px;
        height: 22px;
    }

    &:hover {
        color: #ffffff !important;
    }
`;

// Si la escena 3D falla (sin WebGL, por ejemplo) se muestra la imagen de fondo de antes
class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
    state = { failed: false };
    static getDerivedStateFromError() {
        return { failed: true };
    }
    render() {
        return this.state.failed ? <Fallback /> : this.props.children;
    }
}

const hasWebGL = () => {
    try {
        const canvas = document.createElement("canvas");
        return !!(canvas.getContext("webgl2") || canvas.getContext("webgl"));
    } catch {
        return false;
    }
};

const domainName = getDomainName();
const protocol = getProtocol();

const HomePage: FC<{}> = () => {
    const isNarrow = useMediaQuery(`(max-width: ${NARROW}px)`);
    const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
    const webgl = useMemo(hasWebGL, []);
    const focus = useHeroStore((s) => s.focus);
    const setFocus = useHeroStore((s) => s.setFocus);
    // concepto fijado con un clic; al pasar el ratón por otro se muestra ese mientras tanto
    const [pinned, setPinned] = useState<Concept | null>(null);

    const showMobileOptions =
        (window._env_ && window._env_.PROTOCOL === "https") || window.location.href.split("/")[2] === "localhost:3000";

    const openDashboards = () => window.open(`${protocol}://${domainName}/grafana/`, "_blank");
    const focused = CONCEPTS.find((c) => c.key === focus);

    return (
        <>
            <Header />
            <Page>
                <Stage>
                    {webgl ? (
                        <SceneBoundary>
                            <Suspense fallback={null}>
                                <HeroScene shift={isNarrow ? 0 : 0.17} reducedMotion={reducedMotion} />
                            </Suspense>
                        </SceneBoundary>
                    ) : (
                        <Fallback />
                    )}
                </Stage>

                <Intro>
                    <Headline>Open-source platform for IoT and digital twins</Headline>
                    <Lead>
                        Connect sensors, store their measurements, run pipelines with ML models and AI agents, and follow
                        every asset through a live 3D twin.
                    </Lead>
                    <Actions aria-label="Platform options">
                        <PrimaryLink end to="/platform_assistant">
                            Open platform assistant
                        </PrimaryLink>
                        <SecondaryButton type="button" onClick={openDashboards}>
                            Dashboards
                        </SecondaryButton>
                        {showMobileOptions && (
                            <>
                                <SecondaryLink end to="/digital_twin_simulator_mobile">
                                    Digital twin simulator
                                </SecondaryLink>
                                <SecondaryLink end to="/mobile_sensors">
                                    Mobile sensors <small>Android</small>
                                </SecondaryLink>
                            </>
                        )}
                    </Actions>
                </Intro>

                {webgl && (
                    <Concepts onMouseLeave={() => setFocus(pinned)}>
                        <ConceptList role="group" aria-label="Highlight a concept in the scene">
                            {CONCEPTS.map((concept) => (
                                <ConceptButton
                                    key={concept.key}
                                    type="button"
                                    $color={concept.color}
                                    $active={focus === concept.key}
                                    aria-pressed={pinned === concept.key}
                                    onMouseEnter={() => setFocus(concept.key)}
                                    onFocus={() => setFocus(concept.key)}
                                    onBlur={() => setFocus(pinned)}
                                    onClick={() => {
                                        const next = pinned === concept.key ? null : concept.key;
                                        setPinned(next);
                                        setFocus(next ?? concept.key);
                                    }}
                                >
                                    {concept.label}
                                </ConceptButton>
                            ))}
                        </ConceptList>
                        <Caption aria-live="polite">
                            {focused ? focused.caption : "Point at a concept to see where it lives in the scene."}
                        </Caption>
                    </Concepts>
                )}

                <Aside>
                    {webgl && (
                        <Hint>
                            {isNarrow
                                ? "Drag to look around. Tap the turbine to send a gust of wind."
                                : "Drag to look around, hover the sensors and click the turbine to send a gust of wind."}
                        </Hint>
                    )}
                    <Credits>
                        <GithubLink href="https://github.com/osi4iot/osi4iot" target="_blank" rel="noreferrer" aria-label="OSI4IOT on GitHub">
                            <FaGithub />
                        </GithubLink>
                        <span>Powered by Aula CIMNE-EEBE</span>
                        <a href="mailto:dicapua@cimne.upc.edu">dicapua@cimne.upc.edu</a>
                        <a href="mailto:rafael.pacheco@upc.edu">rafael.pacheco@upc.edu</a>
                    </Credits>
                </Aside>
            </Page>
        </>
    );
};

export default HomePage;
