import React, { FC, useState } from 'react'
import Map from './Geolocation/Map'
import { IOrgManaged } from './TableColumns/organizationsManagedColumns';
import { IGroupManaged } from './TableColumns/groupsManagedColumns';
import { IDevice } from './TableColumns/devicesColumns';
import SelectOrgManaged from './SelectOrgManaged';
import SelectGroupManaged from './SelectGroupManaged';


export const GEOLOCATION_OPTIONS = {
    MAP: "Map",
    SELECT_ORG: "Select org",
    SELECT_GROUP: "Select group",
}


interface GeolocationContainerProps {
    orgsManaged: IOrgManaged[];
    groupsManaged: IGroupManaged[];
    devices: IDevice[];
    orgSelected: IOrgManaged | null;
    setOrgSelected: (orgSelected: IOrgManaged | null) => void;
    groupSelected: IGroupManaged | null;
    setGroupSelected: (groupSelected: IGroupManaged | null) => void;
    deviceSelected: IDevice | null;
    setDeviceSelected: (deviceSelected: IDevice | null) => void;
    refreshOrgsManaged: () => void;
    refreshGroupsManaged: () => void;
    refreshDevices: () => void;
    initialOuterBounds: number[][];
    outerBounds: number[][];
    setNewOuterBounds: (outerBounds: number[][]) => void;
}

const GeolocationContainer: FC<GeolocationContainerProps> = (
    {
        orgsManaged,
        groupsManaged,
        devices,
        orgSelected,
        setOrgSelected,
        groupSelected,
        setGroupSelected,
        deviceSelected,
        setDeviceSelected,
        refreshOrgsManaged,
        refreshGroupsManaged,
        refreshDevices,
        initialOuterBounds,
        outerBounds,
        setNewOuterBounds

    }) => {
    const [geolocationOptionToShow, setGeolocationOptionToShow] = useState(GEOLOCATION_OPTIONS.MAP);

    const backToMap = () => {
        setGeolocationOptionToShow(GEOLOCATION_OPTIONS.MAP);
    }

    const selectOrgOption = () => {
        setGeolocationOptionToShow(GEOLOCATION_OPTIONS.SELECT_ORG);
    }

    const selectGroupOption = () => {
        setGeolocationOptionToShow(GEOLOCATION_OPTIONS.SELECT_GROUP);
    }

    const giveOrgManagedSelected = (orgSelected: IOrgManaged) => {
        setOrgSelected(orgSelected);
    }

    const giveGroupManagedSelected = (groupSelected: IGroupManaged) => {
        setGroupSelected(groupSelected);
    }

    return (
        <>
            {geolocationOptionToShow === GEOLOCATION_OPTIONS.MAP &&
                <Map
                    orgsManaged={orgsManaged}
                    groupsManaged={groupsManaged}
                    devices={devices}
                    orgSelected={orgSelected}
                    setOrgSelected={(orgSelected: IOrgManaged | null) => setOrgSelected(orgSelected)}
                    groupSelected={groupSelected}
                    setGroupSelected={(groupSelected: IGroupManaged | null) => setGroupSelected(groupSelected)}
                    deviceSelected={deviceSelected}
                    setDeviceSelected={(deviceSelected: IDevice | null) => setDeviceSelected(deviceSelected)}
                    refreshOrgsManaged={refreshOrgsManaged}
                    refreshGroupsManaged={refreshGroupsManaged}
                    refreshDevices={refreshDevices}
                    initialOuterBounds={initialOuterBounds}
                    outerBounds={outerBounds}
                    setNewOuterBounds={setNewOuterBounds}
                    selectOrgOption={selectOrgOption}
                    selectGroupOption={selectGroupOption}
                />
            }
            {geolocationOptionToShow === GEOLOCATION_OPTIONS.SELECT_ORG &&
                <SelectOrgManaged
                    backToMap={backToMap}
                    giveOrgManagedSelected={giveOrgManagedSelected}
                />
            }
            {geolocationOptionToShow === GEOLOCATION_OPTIONS.SELECT_GROUP &&
                <SelectGroupManaged
                    orgId={(orgSelected as IOrgManaged).id}
                    backToMap={backToMap}
                    giveGroupManagedSelected={giveGroupManagedSelected}
                />
            }
        </>
    )
}

export default GeolocationContainer;