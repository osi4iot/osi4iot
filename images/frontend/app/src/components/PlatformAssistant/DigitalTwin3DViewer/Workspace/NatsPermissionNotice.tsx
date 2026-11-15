// A notice in the viewer when the NATS server refuses subjects of the digital twin to the user: its live data
// (or part of it) cannot arrive. The permissions are given when the page connects, so access granted after
// that needs a reload; otherwise a group administrator must give access.
import { FC, useState } from "react";
import styled from "styled-components";
import { RotateCw, ShieldAlert, X } from "lucide-react";
import { DeniedSubject, topicKindOf, usePermissionViolations } from "../../../../tools/natsPermissions";

const Notice = styled.div<{ $top: number }>`
    position: fixed;
    top: ${({ $top }) => $top}px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 1300;
    width: min(640px, calc(100vw - 32px));
    display: flex;
    gap: 12px;
    align-items: flex-start;
    padding: 12px 12px 12px 14px;
    background: #2a1d10;
    border: 1px solid #f2a93b;
    border-radius: 12px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45);
    color: #f3e6d4;
    font: 400 13px Roboto, "Helvetica Neue", Arial, sans-serif;

    > svg {
        width: 20px;
        height: 20px;
        color: #f2a93b;
        flex: none;
        margin-top: 1px;
    }

    strong {
        display: block;
        color: #ffffff;
        font-size: 14px;
        margin-bottom: 2px;
    }

    small {
        display: block;
        margin-top: 4px;
        color: #c9b9a3;
        font-size: 12px;
        word-break: break-word;
    }
`;

const Actions = styled.div`
    display: flex;
    gap: 6px;
    margin-top: 8px;

    button {
        height: 28px;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 0 10px;
        border-radius: 7px;
        border: 1px solid rgba(255, 255, 255, 0.16);
        background: rgba(255, 255, 255, 0.06);
        color: #ffffff;
        font: 500 12px Roboto, "Helvetica Neue", Arial, sans-serif;
        cursor: pointer;
    }
    button:hover {
        border-color: #f2a93b;
    }
    button:focus-visible {
        outline: 2px solid #f2a93b;
        outline-offset: 2px;
    }
    svg {
        width: 14px;
        height: 14px;
    }
`;

const Close = styled.button`
    margin-left: auto;
    flex: none;
    width: 28px;
    height: 28px;
    display: grid;
    place-items: center;
    border: none;
    border-radius: 7px;
    background: transparent;
    color: #c9b9a3;
    cursor: pointer;

    &:hover {
        background: rgba(255, 255, 255, 0.08);
        color: #ffffff;
    }
    svg {
        width: 15px;
        height: 15px;
    }
`;

export const summarizeDenied = (list: DeniedSubject[]): string => {
    const kinds = Array.from(new Set(list.map((d) => topicKindOf(d.subject)))).sort();
    return kinds.length > 6 ? `${kinds.slice(0, 6).join(", ")}…` : kinds.join(", ");
};

export const NatsPermissionNoticeView: FC<{ denied: DeniedSubject[]; top: number; onReload: () => void }> = ({ denied, top, onReload }) => {
    // dismissed until something new is refused
    const [dismissedAt, setDismissedAt] = useState(0);
    const latest = denied.reduce((max, d) => Math.max(max, d.at), 0);
    if (denied.length === 0 || latest <= dismissedAt) return null;
    return (
        <Notice role="alert" $top={top}>
            <ShieldAlert aria-hidden="true" />
            <div>
                <strong>No permission for the live data of this digital twin</strong>
                The server refused {denied.length === 1 ? "1 topic" : `${denied.length} topics`} to your user, so part of the live data
                cannot arrive. If you were given access to the group after opening the page, reload it. If the notice comes back, ask a
                group administrator for access.
                <small>Refused: {summarizeDenied(denied)}</small>
                <Actions>
                    <button type="button" onClick={onReload}>
                        <RotateCw aria-hidden="true" />
                        Reload the page
                    </button>
                </Actions>
            </div>
            <Close type="button" aria-label="Close the notice" title="Close" onClick={() => setDismissedAt(latest)}>
                <X aria-hidden="true" />
            </Close>
        </Notice>
    );
};

const NatsPermissionNotice: FC<{ top: number }> = ({ top }) => {
    const denied = usePermissionViolations();
    return <NatsPermissionNoticeView denied={denied} top={top} onReload={() => window.location.reload()} />;
};

export default NatsPermissionNotice;
