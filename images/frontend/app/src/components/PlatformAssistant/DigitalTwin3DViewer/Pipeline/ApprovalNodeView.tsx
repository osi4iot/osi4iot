// @ts-nocheck
// The Approval node in the pipeline editor: a signal-node look with its four outputs. Its requests are decided on
// the Approvals page (home page) or in Telegram, not here.
import styled from "styled-components";
import { Handle, Position } from "@xyflow/react";
import { UserCheck } from "lucide-react";

const Box = styled.div<{ selected?: boolean }>`
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 2px 6px 2px 4px;
    min-width: 80px;
    min-height: 34px;
    border-radius: 5px;
    background-color: #8a6d3b;
    border: ${(p) => (p.selected ? "2px solid #3b82f6" : "2px solid #a09c98ff")};
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    transition: all 0.2s ease;

    &:hover {
        background-color: #a3844f;
    }
`;

const Icon = styled.div`
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
`;

const Label = styled.div`
    color: #e7e3df;
    font-size: 12px;
    font-weight: 500;
    white-space: nowrap;
    padding-right: 6px;
`;

const StyledHandle = styled(Handle)`
    width: 8px;
    height: 8px;
    background: #e7e3df;
    border: 1px solid #555;
`;

const handleTop = (index: number, total: number) => `${((index + 1) * 100) / (total + 1)}%`;

const OUTPUT_TITLES = ["approved", "rejected", "expired", "new requests"];

export const approvalNodeHint = (channel: string | undefined): string => {
    switch (channel) {
        case "telegram":
            return "Requests decided in Telegram";
        case "both":
            return "Requests decided on the Approvals page (home page) and in Telegram";
    }
    return "Requests decided on the Approvals page (home page)";
};

export function ApprovalNode({ data, selected }) {
    const numOutputs = data?.numOutputs ?? 4;
    return (
        <Box selected={selected} title={approvalNodeHint(data?.settings?.channel)}>
            <StyledHandle type="target" position={Position.Left} style={{ top: "50%", left: "-1px" }} />
            <Icon>
                <UserCheck size={16} color="#e7e3df" />
            </Icon>
            <Label>{data?.label || "Approval"}</Label>
            {Array.from({ length: numOutputs }, (_, index) => (
                <StyledHandle
                    key={index}
                    type="source"
                    position={Position.Right}
                    id={`${data.nodeUid}-${index}`}
                    title={OUTPUT_TITLES[index]}
                    style={{ top: handleTop(index, numOutputs), right: "-1px" }}
                />
            ))}
        </Box>
    );
}
