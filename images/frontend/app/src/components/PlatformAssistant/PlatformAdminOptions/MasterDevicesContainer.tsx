import React, { FC, useCallback } from 'react'
import TableWithPagination from '../Utils/TableWithPagination';
import { MASTER_DEVICES_OPTIONS } from '../Utils/platformAssistantOptions';
import { Create_MASTER_DEVICE_COLUMNS, IMasterDevice } from '../TableColumns/masterDevicesColumns';
import { setMasterDevicesOptionToShow, useMasterDevicesDispatch, useMasterDevicesOptionToShow } from '../../../contexts/masterDevicesOptions';
import CreateMasterDevice from './CreateMasterDevice';
import EditMasterDevice from './EditMasterDevice';


interface MasterDevicesContainerProps {
    masterDevices: IMasterDevice[];
    refreshMasterDevices: () => void;
}


const MasterDevicesContainer: FC<MasterDevicesContainerProps> = ({ masterDevices, refreshMasterDevices }) => {
    const masterDevicesDispatch = useMasterDevicesDispatch();
    const masterDevicesOptionToShow = useMasterDevicesOptionToShow();

    const showMasterDevicesTableOption = useCallback(() => {
        setMasterDevicesOptionToShow(masterDevicesDispatch, { masterDevicesOptionToShow: MASTER_DEVICES_OPTIONS.TABLE });
    }, [masterDevicesDispatch]);

    return (
        <>
            {masterDevicesOptionToShow === MASTER_DEVICES_OPTIONS.CREATE_MASTER_DEVICE &&
                <CreateMasterDevice
                    backToTable={showMasterDevicesTableOption}
                    refreshMasterDevices={refreshMasterDevices}
                />
            }
            {masterDevicesOptionToShow === MASTER_DEVICES_OPTIONS.EDIT_MASTER_DEVICE &&
                <EditMasterDevice
                    masterDevices={masterDevices}
                    refreshMasterDevices={refreshMasterDevices}
                    backToTable={showMasterDevicesTableOption}
                />
            }
            {masterDevicesOptionToShow === MASTER_DEVICES_OPTIONS.TABLE &&
                <TableWithPagination
                    dataTable={masterDevices}
                    columnsTable={Create_MASTER_DEVICE_COLUMNS(refreshMasterDevices)}
                    componentName="master device"
                    reloadTable={refreshMasterDevices}
                    createComponent={() => setMasterDevicesOptionToShow(masterDevicesDispatch, { masterDevicesOptionToShow: MASTER_DEVICES_OPTIONS.CREATE_MASTER_DEVICE })}
                />
            }
        </>
    )
}

export default MasterDevicesContainer;