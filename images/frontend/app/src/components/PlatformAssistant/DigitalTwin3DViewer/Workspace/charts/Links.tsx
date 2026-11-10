// The links of a chart (Grafana's data links and panel links): a click on a value opens its link, or a small
// menu when it has several. The addresses get their variables (${__value.raw}, ${__series.name}, ${__from}…)
// and only web addresses or paths of the platform open.
import { FC, ReactNode, useCallback, useEffect, useRef, useState } from "react";
import styled from "styled-components";
import { ExternalLink } from "lucide-react";
import { DataLink, LinkContext, interpolateLink, interpolateTitle, validLinks } from "./chartConfig";

const Menu = styled.div`
    position: absolute;
    z-index: 30;
    min-width: 180px;
    max-width: 320px;
    padding: 4px;
    background: #1b1e22;
    border: 1px solid #2c3137;
    border-radius: 8px;
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.5);
    font: 400 13px Roboto, "Helvetica Neue", Arial, sans-serif;

    a {
        display: flex;
        align-items: center;
        gap: 8px;
        min-height: 32px;
        padding: 0 10px;
        border-radius: 6px;
        color: #d5d9de;
        text-decoration: none;
    }

    a:hover,
    a:focus-visible {
        background: #23324a;
        color: #e6efff;
        outline: none;
    }

    svg {
        width: 13px;
        height: 13px;
        flex: none;
    }
`;

export interface ResolvedLink {
    title: string;
    href: string;
    targetBlank: boolean;
}

export const resolveLinks = (links: DataLink[] | undefined, ctx: LinkContext): ResolvedLink[] =>
    validLinks(links)
        .map((l) => ({ title: interpolateTitle(l.title || l.url, ctx), href: interpolateLink(l.url, ctx), targetBlank: !!l.targetBlank }))
        .filter((l): l is ResolvedLink => l.href !== null);

export const openLink = (link: ResolvedLink) => {
    if (link.targetBlank) window.open(link.href, "_blank", "noopener,noreferrer");
    else window.location.assign(link.href);
};

// A menu of links where the user clicked, inside a box with position: relative
export const useLinkMenu = () => {
    const [menu, setMenu] = useState<{ links: ResolvedLink[]; x: number; y: number } | null>(null);
    const boxRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!menu) return;
        const close = (e: MouseEvent | KeyboardEvent) => {
            if (e instanceof KeyboardEvent && e.key !== "Escape") return;
            if (e instanceof MouseEvent && boxRef.current?.querySelector("[data-links-menu]")?.contains(e.target as Node)) return;
            setMenu(null);
        };
        document.addEventListener("mousedown", close);
        document.addEventListener("keydown", close);
        return () => {
            document.removeEventListener("mousedown", close);
            document.removeEventListener("keydown", close);
        };
    }, [menu]);
    const open = useCallback((links: DataLink[] | undefined, ctx: LinkContext, clientX: number, clientY: number) => {
        const resolved = resolveLinks(links, ctx);
        if (!resolved.length) return false;
        if (resolved.length === 1) {
            openLink(resolved[0]);
            return true;
        }
        const rect = boxRef.current?.getBoundingClientRect();
        // kept inside the panel: to the left of the click near the right edge, above it near the bottom
        const width = 220;
        const height = 12 + resolved.length * 32;
        let x = clientX - (rect?.left ?? 0);
        let y = clientY - (rect?.top ?? 0);
        if (rect && x + width > rect.width) x = Math.max(4, x - width);
        if (rect && y + height > rect.height) y = Math.max(4, y - height);
        setMenu({ links: resolved, x, y });
        return true;
    }, []);
    const element: ReactNode = menu ? (
        <Menu data-links-menu role="menu" aria-label="Links" style={{ left: menu.x, top: menu.y }}>
            {menu.links.map((l) => (
                <a key={l.href + l.title} role="menuitem" href={l.href} target={l.targetBlank ? "_blank" : undefined} rel="noopener noreferrer" onClick={() => setMenu(null)}>
                    <ExternalLink aria-hidden="true" />
                    {l.title}
                </a>
            ))}
        </Menu>
    ) : null;
    return { boxRef, open, element };
};

// The links of a panel (Panel options › Panel links), as a menu in the panel's bar
export const PanelLinks: FC<{ links: unknown; from?: number; to?: number }> = ({ links, from, to }) => {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    const resolved = resolveLinks(links as DataLink[], { from, to });
    useEffect(() => {
        if (!open) return;
        const close = (e: MouseEvent) => {
            if (!ref.current?.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener("mousedown", close);
        return () => document.removeEventListener("mousedown", close);
    }, [open]);
    if (!resolved.length) return null;
    return (
        <div ref={ref} style={{ position: "relative" }} className="ws-no-drag">
            <button
                type="button"
                aria-label="Panel links"
                aria-haspopup="menu"
                aria-expanded={open}
                title="Links"
                onClick={() => setOpen((v) => !v)}
                style={{ width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "1px solid transparent", borderRadius: 7, color: "#c7cbd1", cursor: "pointer" }}
            >
                <ExternalLink aria-hidden="true" style={{ width: 15, height: 15 }} />
            </button>
            {open && (
                <Menu role="menu" aria-label="Panel links" style={{ right: 0, top: 34 }}>
                    {resolved.map((l) => (
                        <a key={l.href + l.title} role="menuitem" href={l.href} target={l.targetBlank ? "_blank" : undefined} rel="noopener noreferrer" onClick={() => setOpen(false)}>
                            <ExternalLink aria-hidden="true" />
                            {l.title}
                        </a>
                    ))}
                </Menu>
            )}
        </div>
    );
};
