import { FC, useEffect, useState, useRef } from "react";
import { GeoJSON, Marker, useMap } from 'react-leaflet';
import { StyledTooltip as Tooltip } from './Tooltip';
import { LatLngTuple } from 'leaflet';
import {  Polygon } from 'geojson';
import { IOrgManaged } from "../TableColumns/organizationsManagedColumns";
import { IGroupManaged } from "../TableColumns/groupsManagedColumns";


const STATUS_OK = "#3e3f3b";
const STATUS_ALERT = "#ff4040";
const SELECTED = "#3274d9";
const NON_SELECTED = "#9c9a9a";

const setOrgStyle = (orgStatus: string, isSelected: boolean) => {
    if (orgStatus !== "OK") {
        return {
            stroke: true,
            color: isSelected ? SELECTED : NON_SELECTED,
            weight: 3,
            opacity: 1,
            fill: true,
            fillColor: STATUS_ALERT,
            fillOpacity: 0.2
        }

    } else {
        return {
            stroke: true,
            color: isSelected ? SELECTED : NON_SELECTED,
            weight: 3,
            opacity: 1,
            fill: true,
            fillColor: STATUS_OK,
            fillOpacity: 0.2
        }
    }
}



interface GeoOrgProps {
    orgData: IOrgManaged;
    orgSelected: IOrgManaged | null;
    selectOrg: (orgSelected: IOrgManaged) => void;
    groupSelected: IGroupManaged | null;
}

const GeoOrg: FC<GeoOrgProps> = ({ orgData, orgSelected, selectOrg, groupSelected }) => {
    const [outerBounds, setOuterBounds] = useState([[0, 0], [0, 0]]);
    const geoJsonLayer = useRef(null);
    const map = useMap();
    // const [orgStatus, setOrgStatus] = useState("OK");
    const orgStatus = "OK";

    useEffect(() => {
        let maxLongitude = -180;
        let minLongitude = 180;
        let maxLatitude = -90;
        let minLatitude = 90;
        if (orgData.geoJsonData.features && orgData.geoJsonData.features.length !== 0) {
            const coordsArray = (orgData.geoJsonData.features[0].geometry as Polygon).coordinates[0];
            coordsArray.forEach(coords => {
                if (coords[0] > maxLongitude) maxLongitude = coords[0];
                if (coords[0] < minLongitude) minLongitude = coords[0];
                if (coords[1] > maxLatitude) maxLatitude = coords[1];
                if (coords[1] < minLatitude) minLatitude = coords[1];
            })
        }
        const outerBounds = [[minLatitude, minLongitude], [maxLatitude, maxLongitude]];
        setOuterBounds(outerBounds);
    }, [orgData.geoJsonData])

    useEffect(() => {
        if (orgSelected?.id === orgData.id) map.fitBounds(outerBounds as LatLngTuple[]);
    }, [orgSelected, orgData.id, outerBounds, map]);


    const clickHandler = () => {
        map.fitBounds(outerBounds as LatLngTuple[]);
        selectOrg(orgData);
    }


    const styleGeoJson = (geoJsonFeature: any) => {
        const isSelected =  orgSelected?.id === orgData.id;
        return setOrgStyle(orgStatus, isSelected);
    }

    useEffect(() => {
        const currenGeoJsonLayer = geoJsonLayer.current;
        const isSelected = orgSelected?.id === orgData.id;
        if (currenGeoJsonLayer) {
            (currenGeoJsonLayer as any)
                .clearLayers()
                .addData(orgData.geoJsonData)
                .setStyle(setOrgStyle(orgStatus, isSelected));
        }
    }, [orgData, orgSelected, orgStatus]);

    return (
        groupSelected ?
            null
            :
            <GeoJSON ref={geoJsonLayer} data={orgData.geoJsonData} style={styleGeoJson} eventHandlers={{ click: clickHandler }}>
                <Marker position={[orgData.latitude, orgData.longitude]} eventHandlers={{ click: clickHandler }} >
                    <Tooltip sticky>Org: {orgData.acronym}</Tooltip>
                </Marker>
                <Tooltip sticky>Org: {orgData.acronym}</Tooltip>
            </GeoJSON >
    )
}

export default GeoOrg;