import React, { FC } from 'react'
import TableWithPagination from './TableWithPagination';
import { DEVICES_OPTIONS } from './platformAssistantOptions';
import { Create_DEVICES_COLUMNS, IDevice } from './TableColumns/devicesColumns';
import { setDevicesOptionToShow, useDevicesDispatch, useDevicesOptionToShow } from '../../contexts/devicesOptions';
import CreateDevice from './CreateDevice';
import EditDevice from './EditDevice';

interface DevicesContainerProps {
    devices: IDevice[];
    refreshDevices: () => void;
}

const DevicesContainer: FC<DevicesContainerProps> = ({ devices, refreshDevices }) => {
    const devicesDispatch = useDevicesDispatch();
    const devicesOptionToShow = useDevicesOptionToShow();

    const showDevicesTableOption = () => {
        setDevicesOptionToShow(devicesDispatch, { devicesOptionToShow: DEVICES_OPTIONS.TABLE });
    }

    return (
        <>
            {devicesOptionToShow === DEVICES_OPTIONS.CREATE_DEVICE && <CreateDevice backToTable={showDevicesTableOption} refreshDevices={refreshDevices} />}
            {devicesOptionToShow === DEVICES_OPTIONS.EDIT_DEVICE && <EditDevice devices={devices} backToTable={showDevicesTableOption} refreshDevices={refreshDevices} />}
            {devicesOptionToShow === DEVICES_OPTIONS.TABLE &&
                <TableWithPagination
                    dataTable={devices}
                    columnsTable={Create_DEVICES_COLUMNS(refreshDevices)}
                    componentName="device"
                    reloadTable={refreshDevices}
                    createComponent={() => setDevicesOptionToShow(devicesDispatch, { devicesOptionToShow: DEVICES_OPTIONS.CREATE_DEVICE })}
                />
            }
        </>
    )
}

export default DevicesContainer;