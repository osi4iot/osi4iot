import { FC, useEffect, useRef, useState } from "react";
import { GeoJSON, LayerGroup, useMap } from 'react-leaflet';
import { FeatureCollection, Geometry, GeoJsonProperties } from 'geojson';
import { LatLngTuple } from 'leaflet';
import { StyledTooltip as Tooltip } from './Tooltip';
import { IGroupManaged } from "../TableColumns/groupsManagedColumns";
import { IDigitalTwin } from "../TableColumns/digitalTwinsColumns";
import { IDigitalTwinState, ISensorState } from "./GeolocationContainer";
import { findOutStatus } from "./statusTools";
import { IFloor } from "../TableColumns/floorsColumns";
import { findGroupGeojsonData } from "../../../tools/findGroupGeojsonData";
import { IDigitalTwinGltfData } from "../DigitalTwin3DViewer/ViewerUtils";
import GeoNodeRedInstance from "./GeoNodeRedInstance";
import { IAsset } from "../TableColumns/assetsColumns";
import { ISensor } from "../TableColumns/sensorsColumns";
import GeoAssets from "./GeoAssets";
import { IAssetType } from "../TableColumns/assetTypesColumns";

const STATUS_OK = "#3e3f3b";
const STATUS_ALERTING = "#ff4040";
const STATUS_PENDING = "#f79520";
const SELECTED = "#3274d9";
const NORMAL = "#9c9a9a";


const setGroupStyle = (groupStatus: string, isSelected: boolean) => {
    let fillColor = STATUS_OK;
    if (groupStatus === "pending") fillColor = STATUS_PENDING;
    else if (groupStatus === "alerting") fillColor = STATUS_ALERTING;

    let color = NORMAL;
    if (isSelected) color = SELECTED;

    return {
        stroke: true,
        color,
        weight: 3,
        opacity: 1,
        fill: true,
        fillColor,
        fillOpacity: 0.5
    }
}

const findOutIfGroupIsSelected = (groupData: IGroupManaged, groupSelected: IGroupManaged | null) => {
    let isGroupSelected = false;
    if (groupSelected) {
        isGroupSelected = groupSelected.id === groupData.id;
    }
    return isGroupSelected;
}

interface GeoGroupProps {
    floorData: IFloor;
    groupData: IGroupManaged;
    groupSelected: IGroupManaged | null;
    selectGroup: (groupSelected: IGroupManaged) => void;
    assetTypeDataArray: IAssetType[];
    assetDataArray: IAsset[];
    assetSelected: IAsset | null;
    selectAsset: (assetSelected: IAsset | null) => void;
    sensorDataArray: ISensor[];
    sensorSelected: ISensor | null;
    selectSensor: (sensorSelected: ISensor | null) => void;
    digitalTwins: IDigitalTwin[];
    digitalTwinSelected: IDigitalTwin | null;
    selectDigitalTwin: (digitalTwinSelected: IDigitalTwin | null) => void;
    digitalTwinsState: IDigitalTwinState[];
    sensorsState: ISensorState[];
    openDigitalTwin3DViewer: (digitalTwinGltfData: IDigitalTwinGltfData, isGroupDTDemo: boolean) => void;
    setGlftDataLoading: (gtGlftDataLoading: boolean) => void;
}

const GeoGroup: FC<GeoGroupProps> = (
    {
        floorData,
        groupData,
        groupSelected,
        selectGroup,
        assetTypeDataArray,
        assetDataArray,
        assetSelected,
        selectAsset,
        sensorDataArray,
        sensorSelected,
        selectSensor,
        digitalTwins,
        digitalTwinSelected,
        selectDigitalTwin,
        digitalTwinsState,
        sensorsState,
        openDigitalTwin3DViewer,
        setGlftDataLoading
    }) => {
    const map = useMap();
    const geoJsonLayerGroupRef = useRef(null);
    const digitalTwinsFiltered = digitalTwins.filter(digitalTwin => digitalTwin.groupId === groupData.id);
    const assetDataArrayFiltered = assetDataArray.filter(asset => asset.groupId === groupData.id);
    const sensorDataArrayFiltered = sensorDataArray.filter(sensor => sensor.groupId === groupData.id);
    const isGroupSelected = findOutIfGroupIsSelected(groupData, groupSelected);
    const groupGeoJsonData = useState(findGroupGeojsonData(floorData, groupData.featureIndex))[0];

    const styleGeoGroupJson = (geoJsonFeature: any) => {
        const groupDigitalTwinsState = digitalTwinsState.filter(digitalTwin => digitalTwin.groupId === groupData.id);
        const groupSensorsState = sensorsState.filter(sensor => sensor.groupId === groupData.id);
        const status = findOutStatus(groupDigitalTwinsState, groupSensorsState);
        return setGroupStyle(status, isGroupSelected);
    }

    useEffect(() => {
        if (groupSelected &&
            groupSelected.id === groupData.id &&
            !assetSelected &&
            groupSelected.outerBounds
        ) {
            map.fitBounds(groupSelected.outerBounds as LatLngTuple[]);
        }
    }, [groupSelected, groupData, assetSelected, map]);

    const clickHandler = () => {
        selectGroup(groupData);
        let groupOuterBounds = groupData.outerBounds;
        if (!groupOuterBounds) {
            groupOuterBounds = floorData.outerBounds;
        }
        map.fitBounds(groupOuterBounds as LatLngTuple[]);
    }

    return (
        <>
            {
                (Object.keys(groupGeoJsonData).length !== 0) ?
                    <LayerGroup>
                        <GeoJSON
                            ref={geoJsonLayerGroupRef}
                            data={groupGeoJsonData as FeatureCollection<Geometry, GeoJsonProperties>}
                            style={styleGeoGroupJson}
                            eventHandlers={{ click: clickHandler }}
                        >
                            <Tooltip sticky>Group: {groupData.acronym}</Tooltip>
                        </GeoJSON>
                        <GeoNodeRedInstance
                            longitude={groupData.nriInGroupIconLongitude}
                            latitude={groupData.nriInGroupIconLatitude}
                            iconRadio={groupData.nriInGroupIconRadio}
                            nriHash={groupData.nriInGroupHash}
                        />
                        <GeoAssets
                            assetTypeDataArray={assetTypeDataArray}
                            assetDataArray={assetDataArrayFiltered}
                            assetSelected={assetSelected}
                            selectAsset={selectAsset}
                            sensorDataArray={sensorDataArrayFiltered}
                            sensorSelected={sensorSelected}
                            selectSensor={selectSensor}
                            digitalTwins={digitalTwinsFiltered}
                            digitalTwinSelected={digitalTwinSelected}
                            selectDigitalTwin={selectDigitalTwin}
                            digitalTwinsState={digitalTwinsState}
                            sensorsState={sensorsState}
                            openDigitalTwin3DViewer={openDigitalTwin3DViewer}
                            setGlftDataLoading={setGlftDataLoading}
                        />
                    </LayerGroup >
                    :
                    null
            }
        </>
    )
}

export default GeoGroup;