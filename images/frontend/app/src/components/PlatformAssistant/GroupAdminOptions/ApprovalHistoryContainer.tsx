// Group admin → Approval history: the requests of the Approval nodes of the group's digital twins and how
// they ended (approved, rejected, expired), by whom and how long they waited, kept 2 years
// (admin_api approval_history).
import { FC, useCallback } from "react";
import styled from "styled-components";
import { Column } from "../Utils/platformTable";
import { IGroupManaged } from "../TableColumns/groupsManagedColumns";
import { IDigitalTwin } from "../TableColumns/digitalTwinsColumns";
import { EventHistoryView, formatEventTime, formatSeconds, viewColumn } from "./eventHistory";

export interface IApprovalHistoryEvent {
    time: string;
    eventId: string;
    digitalTwinId: number | null;
    digitalTwinUid: string;
    digitalTwinDescription: string;
    assetUid: string;
    assetDescription: string;
    nodeUid: string;
    nodeName: string;
    requestId: string;
    event: string;
    title: string;
    detail: string;
    channel: string;
    requestedAt: string;
    expiresAt: string | null;
    decidedAt: string | null;
    decidedBy: string;
    via: string;
    comment: string;
    waitSeconds: number | null;
}

export const approvalHistoryRow = (e: IApprovalHistoryEvent) => ({
    eventId: e.eventId,
    timeString: formatEventTime(e.time),
    digitalTwin: e.digitalTwinDescription || e.digitalTwinUid,
    node: e.nodeName,
    event: e.event,
    title: e.title,
    detail: e.detail,
    requestedAtString: formatEventTime(e.requestedAt),
    decidedBy: e.decidedBy,
    via: e.via,
    wait: formatSeconds(e.waitSeconds),
    comment: e.comment,
    requestId: e.requestId,
});

const EVENT_COLORS: Record<string, string> = {
    requested: "#5794f2",
    approved: "#73bf69",
    rejected: "#f2495c",
    expired: "#8e8e8e",
};

const EventText = styled.span<{ color: string }>`
    color: ${(props) => props.color};
    font-weight: 600;
`;

const approvalColumns = (onView: (eventId: string) => void): Column<any>[] => [
    { Header: "Time", accessor: "timeString" },
    { Header: "Digital twin", accessor: "digitalTwin" },
    { Header: "Node", accessor: "node" },
    {
        Header: "Event",
        accessor: "event",
        Cell: (props: any) => <EventText color={EVENT_COLORS[props.value] ?? "white"}>{props.value}</EventText>,
    },
    { Header: "Title", accessor: "title" },
    { Header: "Detail", accessor: "detail" },
    { Header: "Requested at", accessor: "requestedAtString" },
    { Header: "Decided by", accessor: "decidedBy" },
    { Header: "Via", accessor: "via" },
    { Header: "Wait", accessor: "wait" },
    { Header: "Comment", accessor: "comment" },
    { Header: "Request", accessor: "requestId" },
    { ...viewColumn(onView), Header: "Message" },
];

interface ApprovalHistoryContainerProps {
    groupsManaged: IGroupManaged[];
    digitalTwins: IDigitalTwin[];
}

const ApprovalHistoryContainer: FC<ApprovalHistoryContainerProps> = ({ groupsManaged, digitalTwins }) => {
    const detailTitle = useCallback(
        (e: IApprovalHistoryEvent) => `${e.title || "Request"} (${e.requestId}): ${e.event} at ${formatEventTime(e.time)}`,
        [],
    );
    return (
        <EventHistoryView<IApprovalHistoryEvent>
            kind="approval"
            groupsManaged={groupsManaged}
            digitalTwins={digitalTwins}
            columns={approvalColumns}
            toRow={approvalHistoryRow}
            detailTitle={detailTitle}
        />
    );
};

export default ApprovalHistoryContainer;
