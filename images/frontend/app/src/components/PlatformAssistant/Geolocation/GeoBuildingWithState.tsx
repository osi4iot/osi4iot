import { FC, useRef } from "react";
import { GeoJSON, Marker, useMap } from 'react-leaflet';
import { LatLngTuple } from 'leaflet';
import { IGroupManaged } from "../TableColumns/groupsManagedColumns";
import { IconAlertingMarker, IconMarker, IconPendingMarker } from "./IconMarker";
import { IDigitalTwinState } from "../GeolocationContainer";
import { findOutStatus } from "./statusTools";
import { IBuilding } from "../TableColumns/buildingsColumns";
import BuildingTooltip, { IOrgManagedWithStatus } from "./BuildingTooltip";
import { IFloor } from "../TableColumns/floorsColumns";
import { IOrgOfGroupsManaged } from "../TableColumns/orgsOfGroupsManagedColumns";


const SELECTED = "#3274d9";
const NON_SELECTED = "#9c9a9a";

const setOrgStyle = (isSelected: boolean) => {
    return {
        stroke: true,
        color: isSelected ? SELECTED : NON_SELECTED,
        weight: 3,
        opacity: 1,
        fill: true,
        fillColor: "#3e3f3b",
        fillOpacity: 0.2
    }
}


interface GeoBuildingWithStateProps {
    buildingData: IBuilding;
    floorsData: IFloor[];
    selectFloor: (floorSelected: IFloor) => void;
    orgsInBuilding: IOrgOfGroupsManaged[];
    buildingSelected: IBuilding | null;
    selectBuilding: (buildingSelected: IBuilding) => void;
    floorSelected: IFloor | null;
    orgSelected: IOrgOfGroupsManaged | null;
    selectOrg: (orgSelected: IOrgOfGroupsManaged) => void;
    groupsManaged: IGroupManaged[];
    groupSelected: IGroupManaged | null;
    selectGroup: (groupSelected: IGroupManaged) => void;
    digitalTwinsState: IDigitalTwinState[];
}

const GeoBuildingWithState: FC<GeoBuildingWithStateProps> = (
    {
        buildingData,
        orgsInBuilding,
        floorsData,
        selectFloor,
        floorSelected,
        buildingSelected,
        selectBuilding,
        orgSelected,
        selectOrg,
        groupsManaged,
        groupSelected,
        selectGroup,
        digitalTwinsState
    }) => {
    const geoJsonLayer = useRef(null);
    const map = useMap();
    const digitalTwinsStateFiltered = digitalTwinsState.filter(item => orgsInBuilding.findIndex(org => org.id === item.orgId) !== -1);
    const buildingStatus = findOutStatus(digitalTwinsStateFiltered);
    const orgsInBuildingWithStatus: IOrgManagedWithStatus[] = orgsInBuilding.map(org => {
        const state = digitalTwinsStateFiltered.filter(item => item.orgId === org.id)[0]?.state;
        return { ...org, state };
    });

    const clickHandler = () => {
        map.fitBounds(buildingData.outerBounds as LatLngTuple[]);
        selectBuilding(buildingData);
        if (orgsInBuilding.length === 1) {
            selectOrg(orgsInBuilding[0]);
            const groupsFiltered = groupsManaged.filter(group => group.orgId === orgsInBuilding[0].id);
            const floorNumbersArray = Array.from(new Set(groupsFiltered.map(group => group.floorNumber)));
            if (floorNumbersArray.length === 1) {
                const floorsFiltered = floorsData.filter(floor => floor.floorNumber ===  floorNumbersArray[0])
                selectFloor(floorsFiltered[0]);
                if (groupsFiltered.length === 1) {
                    selectGroup(groupsFiltered[0]);
                }
            }
        }
    }

    const styleGeoJson = (geoJsonFeature: any) => {
        const isSelected = orgSelected?.buildingId === buildingData.id;
        return setOrgStyle(isSelected);
    }


    return (
        <GeoJSON ref={geoJsonLayer} data={buildingData.geoJsonData} style={styleGeoJson} eventHandlers={{ click: clickHandler }}>
            {
                (orgsInBuilding.length !== 0 && !floorSelected) &&
                <>
                    {buildingStatus === "ok" &&
                        <Marker position={[buildingData.latitude, buildingData.longitude]} eventHandlers={{ click: clickHandler }} icon={IconMarker} >
                        <BuildingTooltip buildingName={buildingData.name} orgsInBuilding={orgsInBuildingWithStatus} orgSelected={orgSelected}/>
                        </Marker>
                    }
                    {buildingStatus === "pending" &&
                        <Marker position={[buildingData.latitude, buildingData.longitude]} eventHandlers={{ click: clickHandler }} icon={IconPendingMarker} >
                        <BuildingTooltip buildingName={buildingData.name} orgsInBuilding={orgsInBuildingWithStatus} orgSelected={orgSelected}/>
                        </Marker>
                    }
                    {buildingStatus === "alerting" &&
                        <Marker position={[buildingData.latitude, buildingData.longitude]} eventHandlers={{ click: clickHandler }} icon={IconAlertingMarker} >
                            <BuildingTooltip buildingName={buildingData.name} orgsInBuilding={orgsInBuildingWithStatus} orgSelected={orgSelected}/>
                        </Marker>
                    }
                </>
            }

            <BuildingTooltip buildingName={buildingData.name} orgsInBuilding={orgsInBuildingWithStatus} orgSelected={orgSelected}/>
        </GeoJSON >
    )
}

export default GeoBuildingWithState;