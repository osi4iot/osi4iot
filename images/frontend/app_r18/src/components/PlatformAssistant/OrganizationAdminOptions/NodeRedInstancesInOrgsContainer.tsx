import React, { FC } from 'react'
import TableWithPagination from '../Utils/TableWithPagination';
import { NODERED_INSTANCES_OPTIONS } from '../Utils/platformAssistantOptions';
import { useNodeRedInstancesOptionToShow } from '../../../contexts/nodeRedInstancesOptions';
import { INodeRedInstanceInOrgsColumns, NODERED_INSTANCE_IN_ORGS_COLUMNS } from '../TableColumns/nodeRedInstancesInOrgsColumns';

interface NodeRedInstancesInOrgsContainerProps {
    nodeRedInstances: INodeRedInstanceInOrgsColumns[];
    refreshNodeRedInstances: () => void;
}

const NodeRedInstancesInOrgsContainer: FC<NodeRedInstancesInOrgsContainerProps> = ({
    nodeRedInstances,
    refreshNodeRedInstances
}) => {
    const nodeRedInstancesOptionToShow = useNodeRedInstancesOptionToShow();
    return (
        <>
            {nodeRedInstancesOptionToShow === NODERED_INSTANCES_OPTIONS.TABLE &&
                <TableWithPagination
                    dataTable={nodeRedInstances}
                    columnsTable={NODERED_INSTANCE_IN_ORGS_COLUMNS}
                    componentName=""
                    reloadTable={refreshNodeRedInstances}
                />
            }
        </>
    )
}

export default NodeRedInstancesInOrgsContainer;