import React, { FC, useCallback, useEffect, useState } from 'react'
import Map from './Map'
import { IGroupManaged } from '../TableColumns/groupsManagedColumns';
import SelectGroupManaged from './SelectGroupManaged';
import { IOrgOfGroupsManaged } from '../TableColumns/orgsOfGroupsManagedColumns';
import SelectOrgOfGroupsManaged from './SelectOrgOfGroupsManaged';
import { IDigitalTwin } from '../TableColumns/digitalTwinsColumns';
import { axiosAuth, getDomainName, getProtocol } from '../../../tools/tools';
import { useAuthDispatch, useAuthState } from '../../../contexts/authContext';
import useInterval from '../../../tools/useInterval';
import { IBuilding } from '../TableColumns/buildingsColumns';
import { IFloor } from '../TableColumns/floorsColumns';
import SelectFloorWithState from './SelectFloorWithState';
import { IDigitalTwinGltfData } from '../DigitalTwin3DViewer/ViewerUtils';
import { getAxiosInstance } from '../../../tools/axiosIntance';
import axiosErrorHandler from '../../../tools/axiosErrorHandler';
import { IAsset } from '../TableColumns/assetsColumns';
import { ISensor } from '../TableColumns/sensorsColumns';


const objectsEqual = (o1: any, o2: any): boolean => {
    if (o1 === null && o2 === null) return true;
    return typeof o1 === 'object' && Object.keys(o1).length > 0
        ? Object.keys(o1).length === Object.keys(o2).length
        && Object.keys(o1).every(p => objectsEqual(o1[p], o2[p]))
        : o1 === o2;
}

const arraysEqual = (a1: any, a2: any) => {
    return a1.length === a2.length && a1.every((o: any, idx: number) => objectsEqual(o, a2[idx]));
}

export const GEOLOCATION_OPTIONS = {
    MAP: "Map",
    SELECT_ORG: "Select org",
    SELECT_FLOOR: "Select floor",
    SELECT_GROUP: "Select group",
    SELECT_ASSET: "Select asset",
    SELECT_SENSOR: "Select sensor",
    SELECT_DIGITAL_TWIN: "Select digital twin",
}

const domainName = getDomainName();
const protocol = getProtocol();
const urlDigitalTwinsState = `${protocol}://${domainName}/admin_api/digital_twins_state/user_managed`;
const urlSensorsState = `${protocol}://${domainName}/admin_api/sensors_state/user_managed`;

export interface IDigitalTwinState {
    orgId: number;
    groupId: number;
    assetId: number;
    digitalTwinId: number;
    state: string;
}

export interface ISensorState {
    orgId: number;
    groupId: number;
    assetId: number;
    sensorId: number;
    state: string;
}

interface GeolocationContainerProps {
    buildings: IBuilding[];
    floors: IFloor[];
    orgsOfGroupsManaged: IOrgOfGroupsManaged[];
    groupsManaged: IGroupManaged[];
    assets: IAsset[];
    sensors: ISensor[];
    digitalTwins: IDigitalTwin[];
    buildingSelected: IBuilding | null;
    selectBuilding: (buildingSelected: IBuilding) => void;
    floorSelected: IFloor | null;
    selectFloor: (floorSelected: IFloor) => void;
    orgSelected: IOrgOfGroupsManaged | null;
    selectOrg: (orgSelected: IOrgOfGroupsManaged) => void;
    groupSelected: IGroupManaged | null;
    selectGroup: (groupSelected: IGroupManaged) => void;
    assetSelected: IAsset | null;
    selectAsset: (assetSelected: IAsset | null) => void;
    sensorSelected: ISensor | null;
    selectSensor: (sensorSelected: ISensor | null) => void;
    digitalTwinSelected: IDigitalTwin | null;
    selectDigitalTwin: (digitalTwinSelected: IDigitalTwin | null) => void;
    refreshBuildings: () => void;
    refreshFloors: () => void;
    refreshOrgsOfGroupsManaged: () => void;
    refreshGroupsManaged: () => void;
    refreshAssets: () => void;
    refreshSensors: () => void;
    refreshDigitalTwins: () => void;
    initialOuterBounds: number[][];
    outerBounds: number[][];
    setNewOuterBounds: (outerBounds: number[][]) => void;
    resetBuildingSelection: () => void;
    openDigitalTwin3DViewer: (digitalTwinGltfData: IDigitalTwinGltfData) => void;
    setGlftDataLoading: (gtGlftDataLoading: boolean) => void;
    digitalTwinsState: IDigitalTwinState[];
    setDigitalTwinsState: (digitalTwinsState: IDigitalTwinState[]) => void;
    sensorsState: ISensorState[];
    setSensorsState: (sensorsState: ISensorState[]) => void;
}

const GeolocationContainer: FC<GeolocationContainerProps> = (
    {
        buildings,
        floors,
        orgsOfGroupsManaged,
        groupsManaged,
        assets,
        sensors,
        digitalTwins,
        buildingSelected,
        selectBuilding,
        floorSelected,
        selectFloor,
        orgSelected,
        selectOrg,
        groupSelected,
        selectGroup,
        assetSelected,
        selectAsset,
        sensorSelected,
        selectSensor,
        selectDigitalTwin,
        digitalTwinSelected,
        refreshBuildings,
        refreshFloors,
        refreshOrgsOfGroupsManaged,
        refreshGroupsManaged,
        refreshAssets,
        refreshSensors,
        refreshDigitalTwins,
        initialOuterBounds,
        outerBounds,
        setNewOuterBounds,
        resetBuildingSelection,
        openDigitalTwin3DViewer,
        setGlftDataLoading,
        digitalTwinsState,
        setDigitalTwinsState,
        sensorsState,
        setSensorsState
    }) => {
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();
    const [geolocationOptionToShow, setGeolocationOptionToShow] = useState(GEOLOCATION_OPTIONS.MAP);

    useEffect(() => {
        const config = axiosAuth(accessToken);
        getAxiosInstance(refreshToken, authDispatch)
            .get(urlDigitalTwinsState, config)
            .then((response) => {
                const digitalTwinsState = response.data;
                setDigitalTwinsState(digitalTwinsState);
            })
            .catch((error) => {
                axiosErrorHandler(error, authDispatch);
            });

        getAxiosInstance(refreshToken, authDispatch)
            .get(urlSensorsState, config)
            .then((response) => {
                const sensorsState = response.data;
                setSensorsState(sensorsState);
            })
            .catch((error) => {
                axiosErrorHandler(error, authDispatch);
            });
    },
        [
            accessToken,
            refreshToken,
            authDispatch,
            setDigitalTwinsState,
            setSensorsState
        ]);

    useInterval(() => {
        const config = axiosAuth(accessToken);
        getAxiosInstance(refreshToken, authDispatch)
            .get(urlDigitalTwinsState, config)
            .then((response) => {
                const newDigitalTwinsState = response.data;
                if (!arraysEqual(newDigitalTwinsState, digitalTwinsState)) {
                    setDigitalTwinsState(newDigitalTwinsState);
                }
            })
            .catch((error) => {
                axiosErrorHandler(error, authDispatch);
            });

        getAxiosInstance(refreshToken, authDispatch)
            .get(urlSensorsState, config)
            .then((response) => {
                const newSensorsState = response.data;
                if (!arraysEqual(newSensorsState, sensorsState)) {
                    setSensorsState(newSensorsState);
                }
            })
            .catch((error) => {
                axiosErrorHandler(error, authDispatch);
            });

    }, 10000);

    useCallback(() => {
        setGeolocationOptionToShow(GEOLOCATION_OPTIONS.SELECT_DIGITAL_TWIN);
    }, []);

    const backToMap = useCallback(() => {
        setGeolocationOptionToShow(GEOLOCATION_OPTIONS.MAP);
    }, [])

    const selectOrgOption = useCallback(() => {
        setGeolocationOptionToShow(GEOLOCATION_OPTIONS.SELECT_ORG);
    }, []);

    const selectFloorOption = useCallback(() => {
        setGeolocationOptionToShow(GEOLOCATION_OPTIONS.SELECT_FLOOR);
    }, []);

    const selectGroupOption = useCallback(() => {
        setGeolocationOptionToShow(GEOLOCATION_OPTIONS.SELECT_GROUP);
    }, []);

    const selectDigitalTwinOption = useCallback(() => {
        setGeolocationOptionToShow(GEOLOCATION_OPTIONS.SELECT_DIGITAL_TWIN);
    }, []);

    const giveBuildingSelected = useCallback((buildingSelected: IBuilding) => {
        selectBuilding(buildingSelected);
    }, [selectBuilding]);

    const giveOrgOfGroupsManagedSelected = useCallback((orgSelected: IOrgOfGroupsManaged) => {
        selectOrg(orgSelected);
    }, [selectOrg]);

    const giveFloorSelected = useCallback((floorSelected: IFloor) => {
        selectFloor(floorSelected);
    }, [selectFloor]);

    const giveGroupManagedSelected = useCallback((groupSelected: IGroupManaged) => {
        selectGroup(groupSelected);
    }, [selectGroup]);


    return (
        <>
            {geolocationOptionToShow === GEOLOCATION_OPTIONS.MAP &&
                <Map
                    buildings={buildings}
                    floors={floors}
                    orgsOfGroupsManaged={orgsOfGroupsManaged}
                    groupsManaged={groupsManaged}
                    assets={assets}
                    sensors={sensors}
                    digitalTwins={digitalTwins}
                    buildingSelected={buildingSelected}
                    selectBuilding={selectBuilding}
                    floorSelected={floorSelected}
                    selectFloor={selectFloor}
                    orgSelected={orgSelected}
                    selectOrg={selectOrg}
                    groupSelected={groupSelected}
                    selectGroup={selectGroup}
                    assetSelected={assetSelected}
                    selectAsset={selectAsset}
                    sensorSelected={sensorSelected}
                    selectSensor={selectSensor}
                    selectDigitalTwin={selectDigitalTwin}
                    digitalTwinSelected={digitalTwinSelected}
                    refreshBuildings={refreshBuildings}
                    refreshFloors={refreshFloors}
                    refreshOrgsOfGroupsManaged={refreshOrgsOfGroupsManaged}
                    refreshGroupsManaged={refreshGroupsManaged}
                    refreshAssets={refreshAssets}
                    refreshSensors={refreshSensors}
                    refreshDigitalTwins={refreshDigitalTwins}
                    initialOuterBounds={initialOuterBounds}
                    outerBounds={outerBounds}
                    setNewOuterBounds={setNewOuterBounds}
                    selectFloorOption={selectFloorOption}
                    selectOrgOption={selectOrgOption}
                    selectGroupOption={selectGroupOption}
                    selectDigitalTwinOption={selectDigitalTwinOption}
                    resetBuildingSelection={resetBuildingSelection}
                    digitalTwinsState={digitalTwinsState}
                    sensorsState={sensorsState}
                    openDigitalTwin3DViewer={openDigitalTwin3DViewer}
                    setGlftDataLoading={setGlftDataLoading}
                />
            }
            {geolocationOptionToShow === GEOLOCATION_OPTIONS.SELECT_ORG &&
                <SelectOrgOfGroupsManaged
                    backToMap={backToMap}
                    giveOrgOfGroupsManagedSelected={giveOrgOfGroupsManagedSelected}
                    buildings={buildings}
                    giveBuildingSelected={giveBuildingSelected}
                    floors={floors}
                    giveFloorSelected={giveFloorSelected}
                    groupsManaged={groupsManaged}
                    orgSelected={orgSelected}
                    giveGroupManagedSelected={giveGroupManagedSelected}
                    digitalTwinsState={digitalTwinsState}
                    sensorsState={sensorsState}
                />
            }
            {(geolocationOptionToShow === GEOLOCATION_OPTIONS.SELECT_FLOOR && orgSelected) &&
                <SelectFloorWithState
                    buildingId={(buildingSelected as IBuilding).id}
                    backToMap={backToMap}
                    floorSelected={floorSelected}
                    giveFloorSelected={giveFloorSelected}
                    digitalTwinsState={digitalTwinsState.filter(digitalTwin => digitalTwin.orgId === orgSelected.id)}
                    sensorsState={sensorsState.filter(sensor => sensor.orgId === orgSelected.id)}
                    groupsData={groupsManaged.filter(group => group.orgId === orgSelected.id)}
                    giveGroupManagedSelected={giveGroupManagedSelected}
                />
            }
            {(geolocationOptionToShow === GEOLOCATION_OPTIONS.SELECT_GROUP && orgSelected && floorSelected) &&
                <SelectGroupManaged
                    orgId={(orgSelected as IOrgOfGroupsManaged).id}
                    floorNumber={floorSelected.floorNumber}
                    backToMap={backToMap}
                    groupSelected={groupSelected}
                    giveGroupManagedSelected={giveGroupManagedSelected}
                    assets={assets}
                    digitalTwinsState={digitalTwinsState.filter(digitalTwin => digitalTwin.orgId === orgSelected.id)}
                    sensorsState={sensorsState.filter(sensorState => sensorState.orgId === orgSelected.id)}
                />
            }
        </>
    )
}

export default GeolocationContainer;