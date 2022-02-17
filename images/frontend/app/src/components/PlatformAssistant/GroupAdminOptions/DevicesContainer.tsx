import React, { FC, useCallback } from 'react'
import TableWithPagination from '../Utils/TableWithPagination';
import { DEVICES_OPTIONS, DEVICES_PREVIOUS_OPTIONS } from '../Utils/platformAssistantOptions';
import { Create_DEVICES_COLUMNS, IDevice } from '../TableColumns/devicesColumns';
import {
    setDevicesOptionToShow,
    useDevicesDispatch,
    useDevicesOptionToShow,
    useDevicesPreviousOption
} from '../../../contexts/devicesOptions';
import CreateDevice from './CreateDevice';
import EditDevice from './EditDevice';
import DeviceLocationContainer from './DeviceLocationContainer';
import {
    useBuildingsTable,
    useFloorsTable,
    useGroupsManagedTable
} from '../../../contexts/platformAssistantContext';
import { toast } from 'react-toastify';
import { IBuilding } from '../TableColumns/buildingsColumns';
import { IFloor } from '../TableColumns/floorsColumns';
import { IOrgOfGroupsManaged } from '../TableColumns/orgsOfGroupsManagedColumns';
import { setDeviceInputData } from '../../../contexts/devicesOptions/devicesAction';
import { useDeviceInputData } from '../../../contexts/devicesOptions/devicesContext';
import { IGroupManaged } from '../TableColumns/groupsManagedColumns';

interface DevicesContainerProps {
    orgsOfGroupManaged: IOrgOfGroupsManaged[];
    groupsManaged: IGroupManaged[];
    buildingsFiltered: IBuilding[];
    floorsFiltered: IFloor[];
    devices: IDevice[];
    refreshDevices: () => void;
    refreshGroups: () => void;
    refreshBuildings: () => void;
    refreshFloors: () => void;
}

const DevicesContainer: FC<DevicesContainerProps> = ({
    orgsOfGroupManaged,
    groupsManaged,
    buildingsFiltered,
    floorsFiltered,
    devices,
    refreshDevices,
    refreshGroups,
    refreshBuildings,
    refreshFloors,
}) => {
    const devicesDispatch = useDevicesDispatch();
    const devicesOptionToShow = useDevicesOptionToShow();
    const previousOption = useDevicesPreviousOption();
    const buildingsTable = useBuildingsTable();
    const floorsTable = useFloorsTable();
    const groupsManagedTable = useGroupsManagedTable();
    const deviceInputData = useDeviceInputData();

    const showDevicesTableOption = () => {
        setDevicesOptionToShow(devicesDispatch, { devicesOptionToShow: DEVICES_OPTIONS.TABLE });
    }

    const backToOption = useCallback(() => {
        if (previousOption === DEVICES_PREVIOUS_OPTIONS.CREATE_DEVICE) {
            setDevicesOptionToShow(devicesDispatch, { devicesOptionToShow: DEVICES_OPTIONS.CREATE_DEVICE });
        } else if (previousOption === DEVICES_PREVIOUS_OPTIONS.EDIT_DEVICE) {
            setDevicesOptionToShow(devicesDispatch, { devicesOptionToShow: DEVICES_OPTIONS.EDIT_DEVICE });
        }
    }, [devicesDispatch, previousOption]);


    const showSelectLocationOption = useCallback(() => {
        if (buildingsFiltered.length !== 0 && floorsFiltered.length !== 0) {
            setDevicesOptionToShow(devicesDispatch, { devicesOptionToShow: DEVICES_OPTIONS.SELECT_LOCATION });
        } else {
            const warningMessage = "To select a location for the device, building and floor geodata must be already entered"
            toast.warning(warningMessage);
        }
    }, [devicesDispatch, buildingsFiltered.length, floorsFiltered.length])

    const setDeviceLocationData = (deviceLong: number, deviceLat: number) => {
        const newDeviceInputData = { ...deviceInputData };
        newDeviceInputData.longitude = deviceLong;
        newDeviceInputData.latitude = deviceLat;
        const deviceInputFormData = { deviceInputFormData: newDeviceInputData };
        setDeviceInputData(devicesDispatch, deviceInputFormData);
    }


    return (
        <>
            {devicesOptionToShow === DEVICES_OPTIONS.CREATE_DEVICE &&
                <CreateDevice
                    backToTable={showDevicesTableOption}
                    refreshDevices={refreshDevices}
                    orgsOfGroupManaged={orgsOfGroupManaged}
                    groupsManaged={groupsManaged}
                    selectLocationOption={showSelectLocationOption}
                />
            }
            {devicesOptionToShow === DEVICES_OPTIONS.EDIT_DEVICE &&
                <EditDevice
                    orgsOfGroupManaged={orgsOfGroupManaged}
                    devices={devices}
                    backToTable={showDevicesTableOption}
                    refreshDevices={refreshDevices}
                    selectLocationOption={showSelectLocationOption}
                />
            }
            {devicesOptionToShow === DEVICES_OPTIONS.TABLE &&
                <TableWithPagination
                    dataTable={devices}
                    columnsTable={Create_DEVICES_COLUMNS(refreshDevices)}
                    componentName="device"
                    reloadTable={refreshDevices}
                    createComponent={() => setDevicesOptionToShow(devicesDispatch, { devicesOptionToShow: DEVICES_OPTIONS.CREATE_DEVICE })}
                />
            }
            {
                devicesOptionToShow === DEVICES_OPTIONS.SELECT_LOCATION &&
                <DeviceLocationContainer
                    buildings={buildingsTable}
                    floors={floorsTable}
                    groups={groupsManagedTable}
                    devices={devices}
                    refreshBuildings={refreshBuildings}
                    refreshFloors={refreshFloors}
                    refreshGroups={refreshGroups}
                    refreshDevices={refreshDevices}
                    backToOption={backToOption}
                    setDeviceLocationData={setDeviceLocationData}
                />


            }
        </>
    )
}

export default DevicesContainer;