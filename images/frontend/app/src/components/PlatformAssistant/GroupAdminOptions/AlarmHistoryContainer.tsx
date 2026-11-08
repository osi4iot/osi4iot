// Group admin → Alarm history: the events of the Alarm nodes of the group's digital twins (raised,
// escalated, acknowledged, shelved, cleared, reset...), kept 2 years (admin_api alarm_history).
import { FC, useCallback } from "react";
import styled from "styled-components";
import { Column } from "../Utils/platformTable";
import { IGroupManaged } from "../TableColumns/groupsManagedColumns";
import { IDigitalTwin } from "../TableColumns/digitalTwinsColumns";
import { EventHistoryView, formatEventTime, formatEventValue, viewColumn } from "./eventHistory";

export interface IAlarmHistoryEvent {
    time: string;
    eventId: string;
    digitalTwinId: number | null;
    digitalTwinUid: string;
    digitalTwinDescription: string;
    assetUid: string;
    assetDescription: string;
    nodeUid: string;
    nodeName: string;
    alarmName: string;
    alarmKey: string;
    event: string;
    level: string;
    state: string;
    shelved: boolean;
    raisedAt: string | null;
    value: unknown;
    threshold: string;
    units: string;
    ackBy: string;
    ackAt: string | null;
    userName: string;
    message: string;
}

export const alarmHistoryRow = (e: IAlarmHistoryEvent) => ({
    eventId: e.eventId,
    timeString: formatEventTime(e.time),
    digitalTwin: e.digitalTwinDescription || e.digitalTwinUid,
    alarm: e.alarmKey ? `${e.alarmName} · ${e.alarmKey}` : e.alarmName,
    event: e.shelved ? `${e.event} (shelved)` : e.event,
    level: e.level,
    state: e.state,
    valueString: e.value === null || e.value === undefined ? "" : `${formatEventValue(e.value)}${e.units ? ` ${e.units}` : ""}`,
    threshold: e.threshold,
    raisedAtString: formatEventTime(e.raisedAt),
    user: e.userName,
    message: e.message,
});

const LEVEL_COLORS: Record<string, string> = { Alarm: "#f2495c", Warning: "#ff9830", Normal: "#73bf69" };

const LevelText = styled.span<{ color: string }>`
    color: ${(props) => props.color};
    font-weight: 600;
`;

const alarmColumns = (onView: (eventId: string) => void): Column<any>[] => [
    { Header: "Time", accessor: "timeString" },
    { Header: "Digital twin", accessor: "digitalTwin" },
    { Header: "Alarm", accessor: "alarm" },
    { Header: "Event", accessor: "event" },
    {
        Header: "Level",
        accessor: "level",
        Cell: (props: any) => <LevelText color={LEVEL_COLORS[props.value] ?? "white"}>{props.value}</LevelText>,
    },
    { Header: "State", accessor: "state" },
    { Header: "Value", accessor: "valueString" },
    { Header: "Threshold", accessor: "threshold" },
    { Header: "Raised at", accessor: "raisedAtString" },
    { Header: "User", accessor: "user" },
    { Header: "Message", accessor: "message" },
    viewColumn(onView),
];

interface AlarmHistoryContainerProps {
    groupsManaged: IGroupManaged[];
    digitalTwins: IDigitalTwin[];
}

const AlarmHistoryContainer: FC<AlarmHistoryContainerProps> = ({ groupsManaged, digitalTwins }) => {
    const detailTitle = useCallback(
        (e: IAlarmHistoryEvent) => `${e.alarmName}${e.alarmKey ? ` · ${e.alarmKey}` : ""}: ${e.event} at ${formatEventTime(e.time)}`,
        [],
    );
    return (
        <EventHistoryView<IAlarmHistoryEvent>
            kind="alarm"
            groupsManaged={groupsManaged}
            digitalTwins={digitalTwins}
            columns={alarmColumns}
            toRow={alarmHistoryRow}
            detailTitle={detailTitle}
        />
    );
};

export default AlarmHistoryContainer;
