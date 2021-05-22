import React, { FC } from 'react'
import TableWithPagination from './TableWithPagination';
import { DEVICES_OPTIONS } from './platformAssistantOptions';
import { Create_DEVICES_COLUMNS, IDevices } from './TableColumns/devicesColumns';
import { setDevicesOptionToShow, useDevicesDispatch, useDevicesOptionToShow } from '../../contexts/devices';
import CreateDevice from './CreateDevice';
import EditDevice from './EditDevice';

interface DevicesContainerProps {
    devices: IDevices[];
    refreshDevices: () => void;
}

const DevicesContainer: FC<DevicesContainerProps> = ({ devices, refreshDevices }) => {
    const devicesDispatch = useDevicesDispatch();
    const devicesOptionToShow = useDevicesOptionToShow();

    return (
        <>
            {devicesOptionToShow ===  DEVICES_OPTIONS.CREATE_DEVICE && <CreateDevice refreshDevices={refreshDevices} />}
            {devicesOptionToShow === DEVICES_OPTIONS.EDIT_DEVICE && <EditDevice refreshDevices={refreshDevices} />}
            {devicesOptionToShow === DEVICES_OPTIONS.TABLE &&
                <TableWithPagination
                    dataTable={devices}
                    columnsTable={Create_DEVICES_COLUMNS(refreshDevices)}
                    componentName="devices"
                    createComponent={() => setDevicesOptionToShow(devicesDispatch, { devicesOptionToShow: DEVICES_OPTIONS.CREATE_DEVICE })}
                />
            }
        </>
    )
}

export default DevicesContainer;