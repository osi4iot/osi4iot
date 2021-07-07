import { FC, useEffect, useState, useRef } from "react";
import { GeoJSON, Marker, useMap } from 'react-leaflet';
import { StyledTooltip as Tooltip } from './Tooltip';
import { LatLngTuple } from 'leaflet';
import { Polygon } from 'geojson';
import { IOrgManaged } from "../TableColumns/organizationsManagedColumns";
import { IGroupManaged } from "../TableColumns/groupsManagedColumns";
import { IconAlertingMarker, IconMarker, IconPendingMarker } from "./IconMarker";
import { IDigitalTwinState } from "../GeolocationContainer";
import { findOutStatus } from "./statusTools";
import { IBuilding } from "../TableColumns/buildingsColumns";


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
    orgSelected: IOrgManaged | null;
    digitalTwinsState: IDigitalTwinState[];
}

const GeoBuilding: FC<GeoBuildingProps> = ({ buildingData, orgSelected, digitalTwinsState }) => {
    const [outerBounds, setOuterBounds] = useState([[0, 0], [0, 0]]);
    const geoJsonLayer = useRef(null);
    const map = useMap();
    const orgsStateFiltered = digitalTwinsState.filter(item => item.digitalTwinId === buildingData.id); ///????
    const orgStatus = findOutStatus(orgsStateFiltered);

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

    // useEffect(() => {
    //     if (orgSelected?.id === orgData.id) map.fitBounds(outerBounds as LatLngTuple[]);
    // }, [orgSelected, orgData.id, outerBounds, map]);


    const clickHandler = () => {
        map.fitBounds(outerBounds as LatLngTuple[]);
        // selectOrg(orgData);
        // const groupsFiltered = groupsManaged.filter(group => group.orgId === orgData.id);
        // if (groupsFiltered.length === 1) {
        //     selectGroup(groupsFiltered[0]);
        // }
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
                {orgStatus === "ok" &&
                    <Marker position={[buildingData.latitude, buildingData.longitude]} eventHandlers={{ click: clickHandler }} icon={IconMarker} >
                        <Tooltip sticky>Org: {buildingData.name}</Tooltip>
                    </Marker>
                }
                {orgStatus === "pending" &&
                    <Marker position={[buildingData.latitude, buildingData.longitude]} eventHandlers={{ click: clickHandler }} icon={IconPendingMarker} >
                        <Tooltip sticky>Org: {buildingData.name}</Tooltip>
                    </Marker>
                }
                {orgStatus === "alerting" &&
                    <Marker position={[buildingData.latitude, buildingData.longitude]} eventHandlers={{ click: clickHandler }} icon={IconAlertingMarker} >
                        <Tooltip sticky>Org: {buildingData.name}</Tooltip>
                    </Marker>
                }
                <Tooltip sticky>Org: {buildingData.name}</Tooltip>
            </GeoJSON>
    )
}

export default GeoBuilding;