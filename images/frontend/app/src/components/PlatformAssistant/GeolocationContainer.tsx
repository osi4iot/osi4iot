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
    selectOrg: (orgSelected: IOrgManaged) => void;
    groupSelected: IGroupManaged | null;
    selectGroup: (groupSelected: IGroupManaged) => void;
    deviceSelected: IDevice | null;
    selectDevice: (deviceSelected: IDevice) => void;
    refreshOrgsManaged: () => void;
    refreshGroupsManaged: () => void;
    refreshDevices: () => void;
    initialOuterBounds: number[][];
    outerBounds: number[][];
    setNewOuterBounds: (outerBounds: number[][]) => void;
    resetOrgSelection: () => void;
}

const GeolocationContainer: FC<GeolocationContainerProps> = (
    {
        orgsManaged,
        groupsManaged,
        devices,
        orgSelected,
        selectOrg,
        groupSelected,
        selectGroup,
        deviceSelected,
        selectDevice,
        refreshOrgsManaged,
        refreshGroupsManaged,
        refreshDevices,
        initialOuterBounds,
        outerBounds,
        setNewOuterBounds,
        resetOrgSelection
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
        selectOrg(orgSelected);
    }

    const giveGroupManagedSelected = (groupSelected: IGroupManaged) => {
        selectGroup(groupSelected);
    }

    return (
        <>
            {geolocationOptionToShow === GEOLOCATION_OPTIONS.MAP &&
                <Map
                    orgsManaged={orgsManaged}
                    groupsManaged={groupsManaged}
                    devices={devices}
                    orgSelected={orgSelected}
                    selectOrg={selectOrg}
                    groupSelected={groupSelected}
                    selectGroup={selectGroup}
                    deviceSelected={deviceSelected}
                    selectDevice={selectDevice}
                    refreshOrgsManaged={refreshOrgsManaged}
                    refreshGroupsManaged={refreshGroupsManaged}
                    refreshDevices={refreshDevices}
                    initialOuterBounds={initialOuterBounds}
                    outerBounds={outerBounds}
                    setNewOuterBounds={setNewOuterBounds}
                    selectOrgOption={selectOrgOption}
                    selectGroupOption={selectGroupOption}
                    resetOrgSelection={resetOrgSelection}
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