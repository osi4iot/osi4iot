import React, { FC } from 'react'
import TableWithPagination from '../Utils/TableWithPagination';
import { MASTER_DEVICES_OPTIONS } from '../Utils/platformAssistantOptions';
import { useMasterDevicesOptionToShow } from '../../../contexts/masterDevicesOptions';
import { IMasterDeviceInOrgsColumns, MASTER_DEVICE_IN_ORGS_COLUMNS } from '../TableColumns/masterDevicesInOrgsColumns';



interface MasterDevicesInOrgsContainerProps {
    masterDevices: IMasterDeviceInOrgsColumns[];
    refreshMasterDevices: () => void;
}


const MasterDevicesInOrgsContainer: FC<MasterDevicesInOrgsContainerProps> = ({ masterDevices, refreshMasterDevices }) => {
    const masterDevicesOptionToShow = useMasterDevicesOptionToShow();
    return (
        <>
            {masterDevicesOptionToShow === MASTER_DEVICES_OPTIONS.TABLE &&
                <TableWithPagination
                    dataTable={masterDevices}
                    columnsTable={MASTER_DEVICE_IN_ORGS_COLUMNS}
                    componentName=""
                    reloadTable={refreshMasterDevices}
                />
            }
        </>
    )
}

export default MasterDevicesInOrgsContainer;