// A button that copies a code to the clipboard and shows a check for a moment once it is copied (the editors of the
// Function nodes). Without the Clipboard API (a page served over http) it copies through a hidden text area.
import { FC, useEffect, useRef, useState } from "react";
import styled from "styled-components";
import { Check, Copy } from "lucide-react";

const Button = styled.button<{ $copied: boolean }>`
    margin-left: auto;
    align-self: center;
    display: flex;
    align-items: center;
    gap: 6px;
    height: 30px;
    padding: 0 10px;
    margin-right: 14px;
    background: ${({ $copied }) => ($copied ? "rgba(34, 197, 94, 0.15)" : "#374151")};
    border: 1px solid ${({ $copied }) => ($copied ? "#22c55e" : "#4b5563")};
    border-radius: 6px;
    color: ${({ $copied }) => ($copied ? "#4ade80" : "#d1d5db")};
    font-size: 13px;
    cursor: pointer;
    transition:
        background 0.2s,
        border-color 0.2s,
        color 0.2s;

    &:hover {
        border-color: ${({ $copied }) => ($copied ? "#22c55e" : "#6b7280")};
        color: ${({ $copied }) => ($copied ? "#4ade80" : "#f9fafb")};
    }
`;

export const copyText = async (text: string): Promise<void> => {
    if (navigator.clipboard?.writeText && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return;
    }
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    try {
        if (!document.execCommand("copy")) throw new Error("The code could not be copied");
    } finally {
        document.body.removeChild(area);
    }
};

export const CopyCodeButton: FC<{ code: string; label?: string }> = ({ code, label = "Copy the code" }) => {
    const [copied, setCopied] = useState(false);
    const [failed, setFailed] = useState(false);
    const timer = useRef<number | undefined>(undefined);
    useEffect(() => () => window.clearTimeout(timer.current), []);
    const copy = async () => {
        window.clearTimeout(timer.current);
        try {
            await copyText(code);
            setFailed(false);
            setCopied(true);
        } catch {
            setFailed(true);
            setCopied(false);
        }
        timer.current = window.setTimeout(() => {
            setCopied(false);
            setFailed(false);
        }, 1500);
    };
    return (
        <Button type="button" $copied={copied} aria-label={label} title={failed ? "The code could not be copied" : label} onClick={copy}>
            {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
            {copied ? "Copied" : failed ? "Not copied" : "Copy"}
        </Button>
    );
};
