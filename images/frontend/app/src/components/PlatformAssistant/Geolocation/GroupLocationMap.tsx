import { FC, useMemo, useCallback, useEffect } from 'react'
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapContainer, GeoJSON, useMap, useMapEvents } from 'react-leaflet';
import styled from "styled-components";
import { MdZoomOutMap } from "react-icons/md";
import { RiZoomInLine, RiZoomOutLine } from "react-icons/ri";
import { FaRedo, FaRegTimesCircle, FaRegCheckCircle } from "react-icons/fa";
import { LatLngTuple } from 'leaflet';
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
import { IBuilding } from '../TableColumns/buildingsColumns';
import { IFloor } from '../TableColumns/floorsColumns';
import GeoBuilding from './GeoBuilding';
import { IFeatureCollection, spacesDivider } from '../../../tools/spacesDivider';
import GeoFloorSpace from './GeoFloorSpace';
import { useGroupInputData, useGroupsPreviousOption } from '../../../contexts/groupsOptions';
import { GROUPS_PREVIOUS_OPTIONS } from '../platformAssistantOptions';

const MapContainerStyled = styled(MapContainer)`
    background-color: #212121;

    &.leaflet-container {
        background:  #212121;
        outline: 0;
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
    floorSelected: IFloor | null;
    giveFloorSelected: (floorSelected: IFloor | null) => void;
    spaceSelected: IFeatureCollection | null;
    setGroupLocationData: (floorNumber: number, featureIndex: number) => void;
}


const Controls: FC<ControlProps> = ({
    initialOuterBounds,
    refreshAll,
    backToOption,
    floorSelected,
    giveFloorSelected,
    spaceSelected,
    setGroupLocationData
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
        giveFloorSelected(null);
        backToOption();
    }

    const clickAccepHandler = () => {
        if (floorSelected && spaceSelected) {
            const floorNumber = floorSelected.floorNumber;
            const featureIndex = spaceSelected.features[0]?.properties.index;
            setGroupLocationData(floorNumber, featureIndex);
        }
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


const ComponentsControlContainer = styled.div`
    position: absolute;
    z-index: 1000;
    right: 0;
    top: 0;
    width: 350px;
    margin: 15px;
    padding: 10px;
    border: 2px solid #3274d9;
    border-radius: 15px;
    background-color: #202226;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    align-items: center;
`;

const ComponentControlContainer = styled.div`
    margin: 7px 10px;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    align-items: flex-start;
    width: 100%;
`;

const ComponentSelection = styled.div`
    display: flex;
    justify-content: space-between;
    width: 100%;
`;

const ComponentLabel = styled.div`
    margin: 0 0 2px 6px;
    font-size: 14px;
    width: calc(100% - 6px);
`;

const SelectionButton = styled.button`
    font-size: 14px;
    border: 2px solid #2c3235;
    border-radius: 10px;
    background-color: #0c0d0f;
    color: white;
    cursor: pointer;
    padding: 5px 20px;
    width: 80px;
    &:hover {
		color: #3274d9;
        border: 2px solid #3274d9;
	}
`;

const ComponentName = styled.div`
    height: 30px;
    font-size: 14px;
    background-color: #0c0d0f;
    border: 2px solid #2c3235;
    padding: 5px;
    margin-left: 2px;
    color: white;
    width: 240px;
`;


interface FloorsControlProps {
    floorSelected: IFloor | null;
    selectFloorOption: () => void;
}

const FloorsControl: FC<FloorsControlProps> = ({ floorSelected, selectFloorOption }) => {
    const clickHandler = () => {
        selectFloorOption();
    };

    return (
        <ComponentControlContainer>
            <ComponentLabel>Floor number:</ComponentLabel>
            <ComponentSelection>
                <ComponentName>
                    {floorSelected ? floorSelected.floorNumber : ""}
                </ComponentName>
                <SelectionButton onClick={clickHandler} >Select</SelectionButton>
            </ComponentSelection>
        </ComponentControlContainer>
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

const STATUS_OK = "#3e3f3b";
const NORMAL = "#9c9a9a";

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

interface GroupLocationMapProps {
    outerBounds: number[][];
    building: IBuilding;
    floors: IFloor[];
    floorSelected: IFloor | null;
    giveFloorSelected: (floorSelected: IFloor | null) => void;
    spaceSelected: IFeatureCollection | null;
    giveSpaceSelected: (spaceSelected: IFeatureCollection) => void;
    refreshBuildings: () => void;
    refreshFloors: () => void;
    setNewOuterBounds: (outerBounds: number[][]) => void;
    selectFloorOption: () => void;
    backToOption: () => void;
    setGroupLocationData: (floorNumber: number, featureIndex: number) => void;
}


const GroupLocationMap: FC<GroupLocationMapProps> = (
    {
        outerBounds,
        building,
        floors,
        floorSelected,
        giveFloorSelected,
        spaceSelected,
        giveSpaceSelected,
        refreshBuildings,
        refreshFloors,
        setNewOuterBounds,
        selectFloorOption,
        backToOption,
        setGroupLocationData
    }) => {

    const { floorOutline, floorSpaces } = useMemo(() => {
        const floorData = floors.filter(floor => floor.id === floorSelected?.id)[0];
        return spacesDivider(floorData);
    }, [floors, floorSelected]);
    const editGroupInputData = useGroupInputData();
    const previousOption = useGroupsPreviousOption();

    useEffect(() => {
        if (previousOption === GROUPS_PREVIOUS_OPTIONS.EDIT_GROUP) {
            if (!floorSelected) {
                const floorNumber = editGroupInputData.floorNumber;
                const filteredFloor = floors.filter(floor => floor.floorNumber === floorNumber)[0];
                giveFloorSelected(filteredFloor);
            }
            if (floorSpaces) {
                const featureIndex = editGroupInputData.featureIndex;
                const floorSpacesFiltered = floorSpaces.filter(space => space.features[0].properties.index === featureIndex)[0];
                giveSpaceSelected(floorSpacesFiltered);
            }
        } else if (previousOption === GROUPS_PREVIOUS_OPTIONS.CREATE_GROUP) {
            if (floors.length === 1) {
                giveFloorSelected(floors[0]);
            }
        }

    }, [previousOption, editGroupInputData, floors, floorSelected, giveFloorSelected, floorSpaces, giveSpaceSelected])

    const refreshAll = useCallback(() => {
        refreshBuildings();
        refreshFloors();
    }, [
        refreshBuildings,
        refreshFloors
    ])

    return (
        <MapContainerStyled maxZoom={30} scrollWheelZoom={true} zoomControl={false} doubleClickZoom={false} >
            <MapEvents setNewOuterBounds={setNewOuterBounds} />
            <GeoBuilding outerBounds={outerBounds} buildingData={building} />
            {floorOutline &&
                <GeoJSON data={floorOutline} style={(geoJsonFeature: any) => floorStyle()} />
            }

            {
                floorSpaces &&
                floorSpaces.map(floorSpace =>
                    <GeoFloorSpace
                        key={floorSpace.features[0]?.properties?.index}
                        spaceSelected={spaceSelected}
                        setSpaceSelected={giveSpaceSelected}
                        spaceGeodata={floorSpace}
                    />
                )

            }
            <ControlsContainer>
                <Controls
                    initialOuterBounds={building.outerBounds}
                    refreshAll={refreshAll}
                    backToOption={backToOption}
                    floorSelected={floorSelected}
                    giveFloorSelected={giveFloorSelected}
                    spaceSelected={spaceSelected}
                    setGroupLocationData={setGroupLocationData}
                />
                <ComponentsControlContainer>
                    <FloorsControl
                        floorSelected={floorSelected}
                        selectFloorOption={selectFloorOption}
                    />
                </ComponentsControlContainer>
            </ControlsContainer>
        </MapContainerStyled>
    )
}

export default GroupLocationMap;
