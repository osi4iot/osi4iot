import { FC, useMemo, useCallback, useState, useEffect, useRef } from 'react'
import L, { LeafletMouseEvent, LatLngExpression } from 'leaflet';
import centerOfMass from '@turf/center-of-mass';
import { polygon } from '@turf/helpers';
import 'leaflet/dist/leaflet.css';
import { MapContainer, GeoJSON, useMap, Circle, LayerGroup, useMapEvents, SVGOverlay } from 'react-leaflet';
import styled from "styled-components";
import { MdZoomOutMap } from "react-icons/md";
import { RiZoomInLine, RiZoomOutLine } from "react-icons/ri";
import { FaRedo, FaRegTimesCircle, FaRegCheckCircle } from "react-icons/fa";
import { LatLngTuple } from 'leaflet';
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
import { StyledTooltip as Tooltip } from './Tooltip';
import { IBuilding } from '../TableColumns/buildingsColumns';
import { IFloor } from '../TableColumns/floorsColumns';
import GeoBuilding from './GeoBuilding';
import { IFeatureCollection, spacesDivider } from '../../../tools/spacesDivider';
import { IDevice } from '../TableColumns/devicesColumns';
import { useDeviceIdToEdit, useDevicesPreviousOption } from '../../../contexts/devicesOptions';
import { IGroupManaged } from '../TableColumns/groupsManagedColumns';
import { DeviceSvgImage } from './GeoDevice';
import calcGeoBounds from '../../../tools/calcGeoBounds';
import { DEVICES_PREVIOUS_OPTIONS } from '../Utils/platformAssistantOptions';


const MapContainerStyled = styled(MapContainer)`
    background-color: #212121;

    &.leaflet-container {
        background:  #212121;
        outline: 0;
    }
`;


const CircleStyledDragging = styled(Circle)`
    &:hover {
        cursor: all-scroll;
    }
`;

const CircleStyledNoDragging = styled(Circle)`
    &:hover {
        cursor: auto;
    }
`;


let DefaultIcon = L.icon({
    iconUrl: icon,
    iconAnchor: [12, 41],
    shadowUrl: iconShadow
});

L.Marker.prototype.options.icon = DefaultIcon;


const ControlsContainer = styled.div`
    background-color: green;
    width: 100%;
`;

const ZoomControlContainer = styled.div`
    position: absolute;
    z-index: 1000;
    left: 0;
    top: 0;
    margin: 15px;
    padding: 10px 0;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    align-items: flex-start;
    // border: 3px solid #2c3235;
    border: 2px solid #3274d9;
    border-radius: 15px;
    background-color: #202226;
`;

const RiZoomInLineStyled = styled(RiZoomInLine)`
    font-size: 30px;
    color: white;
`;

const RiZoomOutLineStyled = styled(RiZoomOutLine)`
    font-size: 30px;
    color: white;
`;


const MdZoomOutMapStyled = styled(MdZoomOutMap)`
    font-size: 30px;
    color: white;
`;

const FaRedoStyled = styled(FaRedo)`
    font-size: 22px;
    color: white;
`;

const FaRegTimesCircleStyled = styled(FaRegTimesCircle)`
    font-size: 28px;
    color: white;
`;

const FaRegCheckCircleStyled = styled(FaRegCheckCircle)`
    font-size: 28px;
    color: white;
`;



const ZoomControlItem = styled.div`
    background-color: #202226;
    padding: 3px;
    margin: 3px 5px;
    width: 35px;
    height: 35px;
    display: flex;
    justify-content: center;
    align-items: center;

    &:hover {
        cursor: pointer;

        & ${RiZoomInLineStyled} {
			color: #3274d9;
		}

        & ${RiZoomOutLineStyled} {
			color: #3274d9;
		}

        & ${MdZoomOutMapStyled} {
			color: #3274d9;
		}

        & ${FaRedoStyled} {
			color: #3274d9;
		}

        & ${FaRegTimesCircleStyled} {
			color: #3274d9;
		}

        & ${FaRegCheckCircleStyled} {
			color: #3274d9;
		}
    }
`;


const findOuterBounds = (bounds: L.LatLngBounds) => {
    const minLatitude = bounds.getSouthWest().lat;
    const minLongitude = bounds.getSouthWest().lng;
    const maxLatitude = bounds.getNorthEast().lat;
    const maxLongitude = bounds.getNorthEast().lng;
    const outerBounds = [[minLatitude, minLongitude], [maxLatitude, maxLongitude]];
    return outerBounds;
}

interface ControlProps {
    initialOuterBounds: number[][];
    refreshAll: () => void;
    backToOption: () => void;
    devicePosition: LatLngExpression;
    setDeviceLocationData: (deviceLong: number, deviceLat: number) => void;
}


const Controls: FC<ControlProps> = ({
    initialOuterBounds,
    refreshAll,
    backToOption,
    devicePosition,
    setDeviceLocationData
}) => {
    const map = useMap();
    const clickZoomInHandler = () => {
        map.zoomIn();
    }

    const clickZoomOutHandler = () => {
        map.zoomOut();
    }

    const clickZoomFrameHandler = () => {
        map.fitBounds(initialOuterBounds as LatLngTuple[]);
    }

    const clickReloadHandler = () => {
        refreshAll();
        map.fitBounds(initialOuterBounds as LatLngTuple[]);
    }

    const clickExitHandler = () => {
        backToOption();
    }

    const clickAccepHandler = () => {
        setDeviceLocationData((devicePosition as number[])[1], (devicePosition as number[])[0]);
        backToOption();
    }

    return (
        <ZoomControlContainer>
            <ZoomControlItem onClick={clickZoomInHandler}>
                <RiZoomInLineStyled />
            </ZoomControlItem>
            <ZoomControlItem onClick={clickZoomOutHandler}>
                <RiZoomOutLineStyled />
            </ZoomControlItem>
            <ZoomControlItem onClick={clickZoomFrameHandler}>
                <MdZoomOutMapStyled />
            </ZoomControlItem>
            <ZoomControlItem onClick={clickReloadHandler}>
                <FaRedoStyled />
            </ZoomControlItem>
            <ZoomControlItem onClick={clickExitHandler}>
                <FaRegTimesCircleStyled />
            </ZoomControlItem>
            <ZoomControlItem onClick={clickAccepHandler}>
                <FaRegCheckCircleStyled />
            </ZoomControlItem>
        </ZoomControlContainer>
    )
}

interface MapEventProps {
    setNewOuterBounds: (outerBounds: number[][]) => void;
}

const MapEvents: FC<MapEventProps> = ({ setNewOuterBounds }) => {
    const map = useMapEvents({
        zoomend: () => {
            const bounds = map.getBounds();
            const newOuterBounds = findOuterBounds(bounds);
            setNewOuterBounds(newOuterBounds);
        },
        dragend: () => {
            const bounds = map.getBounds();
            const newOuterBounds = findOuterBounds(bounds);
            setNewOuterBounds(newOuterBounds);
        }
    })
    return null
}

const SELECTED = "#3274d9";
const STATUS_OK = "#3e3f3b";
const NORMAL = "#9c9a9a";
const DEVICE_COLOR = "#e0e0dc";
const deviceRadio = 0.0006;

interface NonDraggableDeviceCircleProps {
    deviceName: string;
    devicePosition: LatLngExpression;
}


const NonDraggableDeviceCircle: FC<NonDraggableDeviceCircleProps> = ({ devicePosition, deviceName }) => {
    const bounds = useState(calcGeoBounds((devicePosition as number[])[1], (devicePosition as number[])[0], deviceRadio))[0];
    return (
        <>
            <Circle
                center={devicePosition}
                pathOptions={{ color: NORMAL, fillColor: "#555555", fillOpacity: 0.5 }}
                radius={1.5}
            >
                <Tooltip sticky>
                    <span style={{ fontWeight: 'bold' }}>Device</span><br />
                    Name: {deviceName}<br />
                </Tooltip>
            </Circle>
            <DeviceSvgImage fillColor={DEVICE_COLOR} bounds={bounds as LatLngTuple[]} />
        </>
    )
};

interface DraggableDeviceCircleProps {
    deviceName: string;
    devicePosition: LatLngExpression;
    setDevicePosition: (devicePosition: LatLngExpression) => void;
    deviceDragging: boolean;
    setDeviceDragging: (deviceDragging: boolean) => void;
}


const DraggableDeviceCircle: FC<DraggableDeviceCircleProps> = ({
    deviceName,
    devicePosition,
    setDevicePosition,
    deviceDragging,
    setDeviceDragging,
}) => {
    const map = useMap();
    const imageRef = useRef();

    const [bounds, setBounds] = useState(calcGeoBounds((devicePosition as number[])[1], (devicePosition as number[])[0], deviceRadio));


    const evenstHandlerCircle = useMemo(
        () => ({
            mousedown() {
                map.dragging.disable();
                setDeviceDragging(true);
            },
            mouseup(e: LeafletMouseEvent) {
                map.dragging.enable();
                setDeviceDragging(false);
                const bounds = calcGeoBounds(e.latlng.lng, e.latlng.lat, deviceRadio)
                setBounds(bounds);
                setDevicePosition([e.latlng.lat, e.latlng.lng])
            },
            mousemove(e: LeafletMouseEvent) {
                if (deviceDragging) {
                    if (imageRef.current) {
                        const bounds = calcGeoBounds(e.latlng.lng, e.latlng.lat, deviceRadio);
                        (imageRef.current as any).setBounds(bounds);
                        setBounds(bounds);
                    }
                    setDevicePosition([e.latlng.lat, e.latlng.lng])
                }
            },
        }),
        [map, setDeviceDragging, deviceDragging, setDevicePosition],
    )


    return (
        <>
            {
                deviceDragging ?
                    <CircleStyledDragging
                        center={devicePosition}
                        pathOptions={{ color: SELECTED, fillColor: "#555555", fillOpacity: 0.5 }}
                        radius={1.5}
                        eventHandlers={evenstHandlerCircle}
                    >
                    </CircleStyledDragging>
                    :
                    <CircleStyledNoDragging
                        center={devicePosition}
                        pathOptions={{ color: SELECTED, fillColor: "#555555", fillOpacity: 0.5 }}
                        radius={1.5}
                        eventHandlers={evenstHandlerCircle}
                    >
                        <Tooltip sticky>
                            <span style={{ fontWeight: 'bold' }}>Device</span><br />
                            Name: {deviceName}<br />
                        </Tooltip>
                    </CircleStyledNoDragging>
            }
            <SVGOverlay ref={imageRef as any} attributes={{ viewBox: "0 0 512 512", fill: DEVICE_COLOR }} bounds={bounds as LatLngTuple[]}>
                <path d="M311.4 32.82C279.9 53.58 259 89.29 259 129.8c0 39.9 20.3 75.2 51.1 96.1l8.1-16.2c-25-17.8-41.2-46.9-41.2-79.9 0-33.59 16.8-63.17 42.5-80.82l-8.1-16.16zm127.2 0l-8.1 16.16C456.2 66.63 473 96.21 473 129.8c0 33-16.2 62.1-41.2 79.9l8.1 16.2c30.8-20.9 51.1-56.2 51.1-96.1 0-40.51-20.9-76.22-52.4-96.98zm-110 34.35C309.4 81.41 297 104.2 297 129.8c0 25 11.9 47.3 30.3 61.6l8.2-16.4c-12.6-11-20.5-27.1-20.5-45.2 0-18.7 8.5-35.3 21.8-46.29l-8.2-16.34zm92.8 0l-8.2 16.34C426.5 94.5 435 111.1 435 129.8c0 18.1-7.9 34.2-20.5 45.2l8.2 16.4c18.4-14.3 30.3-36.6 30.3-61.6 0-25.6-12.4-48.39-31.6-62.63zm-75.3 35.03c-6.9 7.2-11.2 16.9-11.2 27.6 0 10.1 3.8 19.3 10 26.4l9.4-18.7c-.9-2.4-1.4-5-1.4-7.7 0-3.5.8-6.7 2.2-9.6l-9-18zm57.8 0l-9 18c1.4 2.9 2.2 6.1 2.2 9.6 0 2.7-.5 5.3-1.4 7.7l9.4 18.7c6.2-7.1 10-16.3 10-26.4 0-10.7-4.3-20.4-11.2-27.6zM366 144v183h18V144h-18zM25 345v110h462V345H25zm55 39a16 16 0 0 1 16 16 16 16 0 0 1-16 16 16 16 0 0 1-16-16 16 16 0 0 1 16-16zm48 0a16 16 0 0 1 16 16 16 16 0 0 1-16 16 16 16 0 0 1-16-16 16 16 0 0 1 16-16zm48 0a16 16 0 0 1 16 16 16 16 0 0 1-16 16 16 16 0 0 1-16-16 16 16 0 0 1 16-16zM73 473v16h46v-16H73zm320 0v16h46v-16h-46z" />
            </SVGOverlay >
        </>
    )
};


const floorStyle = () => {
    return {
        stroke: true,
        color: NORMAL,
        weight: 1.5,
        opacity: 0.5,
        fill: true,
        fillColor: STATUS_OK,
        fillOpacity: 0.2
    }
}

const groupStyle = () => {
    return {
        stroke: true,
        color: NORMAL,
        weight: 3,
        opacity: 1,
        fill: true,
        fillColor: STATUS_OK,
        fillOpacity: 0.2
    }
}

interface GeoFloorSpaceMapProps {
    floorSpace: IFeatureCollection
}

const GeoFloorSpaceMap: FC<GeoFloorSpaceMapProps> = ({
    floorSpace
}) => {
    const styleGeoFloorJson = (geoJsonFeature: any) => {
        return floorStyle();
    }

    return (
        <GeoJSON
            data={floorSpace}
            style={styleGeoFloorJson}
        />
    )
};

interface GeoGroupSpaceMapProps {
    floorSpace: IFeatureCollection
    floorData: IFloor;
    group: IGroupManaged;
    devicesInGroup: IDevice[];
    devicePosition: LatLngExpression;
    setDevicePosition: (devicePosition: LatLngExpression) => void;
}


const GeoGroupSpaceMap: FC<GeoGroupSpaceMapProps> = ({
    floorSpace,
    floorData,
    group,
    devicesInGroup,
    devicePosition,
    setDevicePosition

}) => {
    const map = useMap();
    const devicesPreviousOption = useDevicesPreviousOption();
    const deviceIdToEdit = useDeviceIdToEdit();
    const [deviceDragging, setDeviceDragging] = useState(false);

    useEffect(() => {
        let groupOuterBounds = group.outerBounds;
        if (!groupOuterBounds) {
            groupOuterBounds = floorData.outerBounds;
        }
        map.fitBounds(groupOuterBounds as LatLngTuple[]);
    }, [group.outerBounds, floorData.outerBounds, map])


    const evenstHandlerGeoJson = useMemo(
        () => ({
            click() {
                let groupOuterBounds = group.outerBounds;
                if (!groupOuterBounds) {
                    groupOuterBounds = floorData.outerBounds;
                }
                map.fitBounds(groupOuterBounds as LatLngTuple[]);
            }
        }),
        [map, group.outerBounds, floorData.outerBounds],
    )


    return (
        <LayerGroup>
            <GeoJSON
                data={floorSpace}
                style={(geoJsonFeature: any) => groupStyle()}
                eventHandlers={evenstHandlerGeoJson}
            />
            {
                devicesInGroup.map(device => {
                    if (device.id === deviceIdToEdit && devicesPreviousOption === DEVICES_PREVIOUS_OPTIONS.EDIT_DEVICE) {
                        return (
                            <DraggableDeviceCircle
                                key={device.id}
                                deviceName={device.name}
                                devicePosition={devicePosition}
                                setDevicePosition={(devicePosition: LatLngExpression) => setDevicePosition(devicePosition)}
                                deviceDragging={deviceDragging}
                                setDeviceDragging={(deviceDragging: boolean) => setDeviceDragging(deviceDragging)}
                            />
                        )
                    } else {
                        return (
                            <NonDraggableDeviceCircle
                                key={device.id}
                                deviceName={device.name}
                                devicePosition={[device.latitude, device.longitude]}
                            />
                        )
                    }
                })
            }
            {
                (devicesPreviousOption === DEVICES_PREVIOUS_OPTIONS.CREATE_DEVICE) &&
                <DraggableDeviceCircle
                    deviceName={`New device for group ${group.acronym}`}
                    devicePosition={devicePosition}
                    setDevicePosition={(devicePosition: LatLngExpression) => setDevicePosition(devicePosition)}
                    deviceDragging={deviceDragging}
                    setDeviceDragging={(deviceDragging: boolean) => setDeviceDragging(deviceDragging)}
                />
            }

        </LayerGroup>
    )
};


const calcInitialDevicePosition = (
    floorSpaces: IFeatureCollection[] | null,
    featureIndex: number,
    devicesPreviousOption: string,
    deviceIdToEdit: number,
    devicesInGroup: IDevice[]) => {
    let devicePosition = [devicesInGroup[0].latitude, devicesInGroup[0].longitude]
    if (floorSpaces) {
        const floorSpace = floorSpaces.filter(space => space.features[0].properties.index === featureIndex)[0];
        if (devicesPreviousOption === DEVICES_PREVIOUS_OPTIONS.CREATE_DEVICE) {
            const geoPolygon = polygon(floorSpace.features[0].geometry.coordinates);
            const center = centerOfMass(geoPolygon);
            devicePosition = [center.geometry.coordinates[1], center.geometry.coordinates[0]]
        } else if (devicesPreviousOption === DEVICES_PREVIOUS_OPTIONS.EDIT_DEVICE) {
            const deviceToEdit = devicesInGroup.filter(device => device.id === deviceIdToEdit)[0];
            devicePosition = [deviceToEdit.latitude, deviceToEdit.longitude]
        }
    }
    return devicePosition;
}

interface DeviceLocationMapProps {
    outerBounds: number[][];
    building: IBuilding;
    floorData: IFloor;
    group: IGroupManaged;
    devicesInGroup: IDevice[];
    featureIndex: number;
    setNewOuterBounds: (outerBounds: number[][]) => void;
    refreshBuildings: () => void;
    refreshFloors: () => void;
    refreshGroups: () => void;
    refreshDevices: () => void;
    backToOption: () => void;
    setDeviceLocationData: (deviceLong: number, deviceLat: number) => void;
}


const DeviceLocationMap: FC<DeviceLocationMapProps> = (
    {
        outerBounds,
        building,
        floorData,
        group,
        devicesInGroup,
        featureIndex,
        setNewOuterBounds,
        refreshBuildings,
        refreshFloors,
        refreshGroups,
        refreshDevices,
        backToOption,
        setDeviceLocationData,
    }) => {
    const { floorOutline, floorSpaces } = useMemo(() => spacesDivider(floorData), [floorData]);
    const floorOutlineData = useState<IFeatureCollection | null>(floorOutline)[0];
    const devicesPreviousOption = useDevicesPreviousOption();
    const deviceIdToEdit = useDeviceIdToEdit();
    const [devicePosition, setDevicePosition] = useState<LatLngExpression>(
        calcInitialDevicePosition(floorSpaces, featureIndex, devicesPreviousOption, deviceIdToEdit, devicesInGroup) as LatLngExpression
    );

    const styleGeoFloorJson = (geoJsonFeature: any) => {
        return floorStyle();
    }

    const refreshAll = useCallback(() => {
        refreshBuildings();
        refreshFloors();
        refreshGroups();
        refreshDevices();
    }, [
        refreshBuildings,
        refreshFloors,
        refreshGroups,
        refreshDevices
    ])

    return (
        <MapContainerStyled maxZoom={30} scrollWheelZoom={true} zoomControl={false} doubleClickZoom={false} >
            <MapEvents setNewOuterBounds={setNewOuterBounds} />
            <GeoBuilding
                outerBounds={outerBounds}
                buildingData={building}
                isNecessaryToFitBounds={false}
            />
            {floorOutlineData &&
                <GeoJSON data={floorOutlineData} style={styleGeoFloorJson} />
            }
            {
                floorSpaces &&
                floorSpaces.map(floorSpace =>
                    floorSpace.features[0].properties.index === featureIndex ?
                        <GeoGroupSpaceMap
                            key={floorSpace.features[0]?.properties?.index}
                            floorSpace={floorSpace}
                            floorData={floorData}
                            group={group}
                            devicesInGroup={devicesInGroup}
                            devicePosition={devicePosition}
                            setDevicePosition={(devicePosition: LatLngExpression) => setDevicePosition(devicePosition)}
                        />
                        :
                        <GeoFloorSpaceMap
                            key={floorSpace.features[0]?.properties?.index}
                            floorSpace={floorSpace}
                        />
                )
            }
            <ControlsContainer>
                <Controls
                    initialOuterBounds={building.outerBounds}
                    refreshAll={refreshAll}
                    backToOption={backToOption}
                    devicePosition={devicePosition}
                    setDeviceLocationData={setDeviceLocationData}
                />
            </ControlsContainer>
        </MapContainerStyled>
    )
}

export default DeviceLocationMap;