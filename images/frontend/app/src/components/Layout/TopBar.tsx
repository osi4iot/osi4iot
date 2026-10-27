// Barra superior de la aplicación con el mismo lenguaje visual que la barra del visor del gemelo digital
// y el inspector (superficie oscura, bordes finos, Roboto, acento azul). La usan el asistente de la
// plataforma (con el botón del menú y la ruta de la sección) y el resto de páginas (Header).
import { FC, ReactNode } from "react";
import { useNavigate } from "react-router";
import styled from "styled-components";
import { LogIn, LogOut } from "lucide-react";
import { logout, useAuthDispatch, useIsUserAuth } from "../../contexts/authContext";
import { useLoggedUserLogin } from "../../contexts/authContext/authContext";

export const TOP_BAR_HEIGHT = 56;
export const MOBILE_BREAKPOINT = 900;

export const shellColors = {
    bar: "#14161a",
    page: "#0c0d0f",
    content: "#202226",
    border: "rgba(255, 255, 255, 0.08)",
    hover: "rgba(255, 255, 255, 0.06)",
    accent: "#3d82f0",
    accentSoft: "rgba(61, 130, 240, 0.16)",
    text: "#e6e8eb",
    textSoft: "#c3c9d1",
    textMuted: "#9aa3ad",
};

export const appFont = `Roboto, "Helvetica Neue", Arial, sans-serif`;

let name = "IOT PLATFORM";
if (window._env_ && window._env_.PLATFORM_NAME) {
    name = `IOT ${window._env_.PLATFORM_NAME.replace("-", "‑").toUpperCase()} PLATFORM`;
}
export const platformName = name;

export const TopBarRoot = styled.header`
    height: ${TOP_BAR_HEIGHT}px;
    flex-shrink: 0;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 12px;
    background-color: ${shellColors.bar};
    border-bottom: 1px solid ${shellColors.border};
    color: ${shellColors.text};
    font-family: ${appFont};
    user-select: none;
    min-width: 0;
    position: relative;
    z-index: 1100;
`;

export const IconButton = styled.button`
    width: 36px;
    height: 36px;
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 0;
    border-radius: 9px;
    background: transparent;
    color: ${shellColors.textSoft};
    cursor: pointer;

    &:hover {
        background-color: ${shellColors.hover};
        color: #ffffff;
    }

    &:focus-visible {
        outline: 2px solid ${shellColors.accent};
        outline-offset: 1px;
    }

    svg {
        width: 20px;
        height: 20px;
    }
`;

const LogoButton = styled.button`
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
    padding: 4px 6px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    cursor: pointer;

    &:hover {
        background-color: ${shellColors.hover};
    }

    &:focus-visible {
        outline: 2px solid ${shellColors.accent};
    }

    img {
        height: 26px;
        width: auto;
        display: block;
    }
`;

const PlatformName = styled.span`
    font: 500 11px ${appFont};
    letter-spacing: 0.08em;
    color: ${shellColors.textMuted};
    white-space: nowrap;

    @media (max-width: 1200px) {
        display: none;
    }
`;

export const BarDivider = styled.div`
    width: 1px;
    height: 24px;
    flex-shrink: 0;
    background-color: rgba(255, 255, 255, 0.1);

    @media (max-width: ${MOBILE_BREAKPOINT}px) {
        display: none;
    }
`;

export const BarSpacer = styled.div`
    flex: 1;
    min-width: 0;
`;

// compact: solo el símbolo (barras estrechas)
export const AppLogo: FC<{ showName?: boolean; compact?: boolean }> = ({ showName = true, compact = false }) => {
    const navigate = useNavigate();
    return (
        <LogoButton type="button" onClick={() => navigate("/")} title="Home page" aria-label="Home page">
            {compact ? (
                <img src={`${import.meta.env.BASE_URL}plaftorm_logo.png`} alt="Logo" style={{ height: 30 }} />
            ) : (
                <img src={`${import.meta.env.BASE_URL}logo_large.png`} alt="Logo" />
            )}
            {showName && <PlatformName>{platformName}</PlatformName>}
        </LogoButton>
    );
};

const UserChip = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    padding: 4px 4px 4px 4px;
`;

const Avatar = styled.div`
    width: 30px;
    height: 30px;
    flex-shrink: 0;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: ${shellColors.accentSoft};
    border: 1px solid rgba(61, 130, 240, 0.45);
    color: #cfe0ff;
    font: 500 13px ${appFont};
    text-transform: uppercase;
`;

const UserName = styled.span`
    font-size: 13px;
    color: ${shellColors.textSoft};
    max-width: 180px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;

    @media (max-width: ${MOBILE_BREAKPOINT}px) {
        display: none;
    }
`;

// Usuario conectado y botón para cerrar sesión (o para iniciarla)
export const UserMenu: FC = () => {
    const authDispatch = useAuthDispatch();
    const navigate = useNavigate();
    const isUserLogged = useIsUserAuth();
    const userName = useLoggedUserLogin() ?? "";

    if (!isUserLogged) {
        return (
            <IconButton type="button" onClick={() => navigate("/login")} title="Sign in" aria-label="Sign in">
                <LogIn />
            </IconButton>
        );
    }
    return (
        <UserChip>
            <Avatar aria-hidden>{userName.slice(0, 1) || "?"}</Avatar>
            <UserName title={userName}>{userName}</UserName>
            <IconButton type="button" onClick={() => logout(authDispatch)} title="Sign out" aria-label="Sign out">
                <LogOut />
            </IconButton>
        </UserChip>
    );
};

// Barra superior genérica (páginas fuera del asistente: inicio, login, móvil...)
export const TopBar: FC<{ left?: ReactNode; center?: ReactNode }> = ({ left, center }) => (
    <TopBarRoot>
        {left}
        <AppLogo />
        {center}
        <BarSpacer />
        <UserMenu />
    </TopBarRoot>
);
