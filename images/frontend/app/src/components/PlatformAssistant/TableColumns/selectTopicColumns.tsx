import { Column } from 'react-table';

export interface ISelectTopic {
    id: number;
    orgId: number;
    groupId: number;
    deviceId: number;
    topicName: string;
}

export const SELECT_TOPIC_COLUMNS: Column<ISelectTopic>[] = [
    {
        Header: "TopicId",
        accessor: "id",
        filter: 'equals'
    },
    {
        Header: "OrgId",
        accessor: "orgId",
        filter: 'equals'
    },
    {
        Header: "GroupId",
        accessor: "groupId",
        filter: 'equals'
    },
    {
        Header: "DeviceId",
        accessor: "deviceId",
        filter: 'equals'
    },
    {
        Header: "Topic name",
        accessor: "topicName",
        filter: 'equals'
    }
]
   