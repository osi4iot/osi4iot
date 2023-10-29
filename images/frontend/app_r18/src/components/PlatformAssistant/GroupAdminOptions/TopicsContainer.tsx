import React, { FC } from 'react'
import TableWithPagination from '../Utils/TableWithPagination';
import { TOPICS_OPTIONS } from '../Utils/platformAssistantOptions';
import CreateTopic from './CreateTopic';
import EditTopic from './EditTopic';
import { Create_TOPICS_COLUMNS, ITopic } from '../TableColumns/topicsColumns';
import {
    setTopicsOptionToShow,
    useTopicsDispatch,
    useTopicsOptionToShow
} from '../../../contexts/topicsOptions';

interface TopicsContainerProps {
    topics: ITopic[];
    refreshTopics: () => void;
}

const TopicsContainer: FC<TopicsContainerProps> = ({ topics, refreshTopics }) => {
    const topicsDispatch = useTopicsDispatch();
    const topicsOptionToShow = useTopicsOptionToShow();

    const showTopicsTableOption = () => {
        setTopicsOptionToShow(topicsDispatch, { topicsOptionToShow: TOPICS_OPTIONS.TABLE });
    }

    return (
        <>
            {topicsOptionToShow === TOPICS_OPTIONS.CREATE_TOPIC && <CreateTopic backToTable={showTopicsTableOption} refreshTopics={refreshTopics} />}
            {topicsOptionToShow === TOPICS_OPTIONS.EDIT_TOPIC && <EditTopic topics={topics} backToTable={showTopicsTableOption} refreshTopics={refreshTopics} />}
            {topicsOptionToShow === TOPICS_OPTIONS.TABLE &&
                <TableWithPagination
                    dataTable={topics}
                    columnsTable={Create_TOPICS_COLUMNS(refreshTopics)}
                    componentName="topic"
                    reloadTable={refreshTopics}
                    createComponent={() => setTopicsOptionToShow(topicsDispatch, { topicsOptionToShow: TOPICS_OPTIONS.CREATE_TOPIC })}
                />
            }
        </>
    )
}

export default TopicsContainer;