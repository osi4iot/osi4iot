import { FC, useEffect, useState, useRef } from "react";
import { GeoJSON, Marker, useMap } from 'react-leaflet';
import { LatLngTuple } from 'leaflet';
import { Polygon } from 'geojson';
import { IOrgManaged } from "../TableColumns/organizationsManagedColumns";
import { IGroupManaged } from "../TableColumns/groupsManagedColumns";
import { IconAlertingMarker, IconMarker, IconPendingMarker } from "./IconMarker";
import { IDigitalTwinState } from "../GeolocationContainer";
import { findOutStatus } from "./statusTools";
import { IBuilding } from "../TableColumns/buildingsColumns";
import BuildingTooltip, { IOrgManagedWithStatus } from "./BuildingTooltip";
import { IFloor } from "../TableColumns/floorsColumns";


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


interface GeoBuildingProps {
    buildingData: IBuilding;
    floorsData: IFloor[];
    selectFloor: (floorSelected: IFloor) => void;
    orgsInBuilding: IOrgManaged[];
    buildingSelected: IBuilding | null;
    selectBuilding: (buildingSelected: IBuilding) => void;
    orgSelected: IOrgManaged | null;
    selectOrg: (orgSelected: IOrgManaged) => void;
    groupsManaged: IGroupManaged[];
    groupSelected: IGroupManaged | null;
    selectGroup: (groupSelected: IGroupManaged) => void;
    digitalTwinsState: IDigitalTwinState[];
}

const GeoBuilding: FC<GeoBuildingProps> = (
    {
        buildingData,
        orgsInBuilding,
        floorsData,
        selectFloor,
        buildingSelected,
        selectBuilding,
        orgSelected,
        selectOrg,
        groupsManaged,
        groupSelected,
        selectGroup,
        digitalTwinsState
    }) => {
    const [outerBounds, setOuterBounds] = useState([[0, 0], [0, 0]]);
    const geoJsonLayer = useRef(null);
    const map = useMap();
    const digitalTwinsStateFiltered = digitalTwinsState.filter(item => orgsInBuilding.findIndex(org => org.id === item.orgId) !== -1);
    const buildingStatus = findOutStatus(digitalTwinsStateFiltered);
    const orgsInBuildingWithStatus: IOrgManagedWithStatus[] = orgsInBuilding.map(org => {
        const state = digitalTwinsStateFiltered.filter(item => item.orgId === org.id)[0]?.state;
        return { ...org, state };
    });

    useEffect(() => {
        let maxLongitude = -180;
        let minLongitude = 180;
        let maxLatitude = -90;
        let minLatitude = 90;
        if (buildingData.geoJsonData.features && buildingData.geoJsonData.features.length !== 0) {
            const coordsArray = (buildingData.geoJsonData.features[0].geometry as Polygon).coordinates[0];
            coordsArray.forEach(coords => {
                if (coords[0] > maxLongitude) maxLongitude = coords[0];
                if (coords[0] < minLongitude) minLongitude = coords[0];
                if (coords[1] > maxLatitude) maxLatitude = coords[1];
                if (coords[1] < minLatitude) minLatitude = coords[1];
            })
        }
        const outerBounds = [[minLatitude, minLongitude], [maxLatitude, maxLongitude]];
        setOuterBounds(outerBounds);
    }, [buildingData.geoJsonData])

    useEffect(() => {
        if (buildingSelected?.id === buildingData.id) map.fitBounds(outerBounds as LatLngTuple[]);
    }, [buildingSelected, buildingData.id, outerBounds, map]);


    const clickHandler = () => {
        map.fitBounds(outerBounds as LatLngTuple[]);
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

    // useEffect(() => {
    //     const currenGeoJsonLayer = geoJsonLayer.current;
    //     const isSelected = orgSelected?.id === orgData.id;
    //     if (currenGeoJsonLayer) {
    //         (currenGeoJsonLayer as any)
    //             .clearLayers()
    //             .addData(orgData.geoJsonData)
    //             .setStyle(setOrgStyle(isSelected));
    //     }
    // }, [orgData, orgSelected, orgStatus]);

    return (
        <GeoJSON ref={geoJsonLayer} data={buildingData.geoJsonData} style={styleGeoJson} eventHandlers={{ click: clickHandler }}>
            {
                (orgsInBuilding.length !== 0 && !orgSelected) &&
                <>
                    {buildingStatus === "ok" &&
                        <Marker position={[buildingData.latitude, buildingData.longitude]} eventHandlers={{ click: clickHandler }} icon={IconMarker} >
                            <BuildingTooltip buildingName={buildingData.name} orgsInBuilding={orgsInBuildingWithStatus} />
                        </Marker>
                    }
                    {buildingStatus === "pending" &&
                        <Marker position={[buildingData.latitude, buildingData.longitude]} eventHandlers={{ click: clickHandler }} icon={IconPendingMarker} >
                            <BuildingTooltip buildingName={buildingData.name} orgsInBuilding={orgsInBuildingWithStatus} />
                        </Marker>
                    }
                    {buildingStatus === "alerting" &&
                        <Marker position={[buildingData.latitude, buildingData.longitude]} eventHandlers={{ click: clickHandler }} icon={IconAlertingMarker} >
                            <BuildingTooltip buildingName={buildingData.name} orgsInBuilding={orgsInBuildingWithStatus} />
                        </Marker>
                    }
                </>
            }

            <BuildingTooltip buildingName={buildingData.name} orgsInBuilding={orgsInBuildingWithStatus} />
        </GeoJSON >
    )
}

export default GeoBuilding;