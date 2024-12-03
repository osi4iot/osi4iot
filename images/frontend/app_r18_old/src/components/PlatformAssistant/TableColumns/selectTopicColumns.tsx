import { Column } from 'react-table';

export interface ISelectTopic {
    id: number;
    orgId: number;
    groupId: number;
    topicType: number,
    description: string;
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
        Header: "Topic type",
        accessor: "topicType",
        filter: 'equals'
    },
    {
        Header: "Description",
        accessor: "description",
        filter: 'equals'
    }
]
   