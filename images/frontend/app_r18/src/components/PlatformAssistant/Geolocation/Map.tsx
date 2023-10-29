import { FC, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import styled from "styled-components";
import { MdZoomOutMap } from "react-icons/md";
import { RiZoomInLine, RiZoomOutLine } from "react-icons/ri";
import { FaRedo } from "react-icons/fa";
import { LatLngTuple } from 'leaflet';
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
import { IOrgManaged } from '../TableColumns/organizationsManagedColumns';
import { IGroupManaged } from '../TableColumns/groupsManagedColumns';
import { IOrgOfGroupsManaged } from '../TableColumns/orgsOfGroupsManagedColumns';
import { IDigitalTwin } from '../TableColumns/digitalTwinsColumns';
import { IDigitalTwinState, ISensorState } from './GeolocationContainer';
import GeoBuildings from './GeoBuildings';
import { IBuilding } from '../TableColumns/buildingsColumns';
import { IFloor } from '../TableColumns/floorsColumns';
import GeoGroups from './GeoGroups';
import { IDigitalTwinGltfData } from '../DigitalTwin3DViewer/ViewerUtils';
import { useWindowWidth } from '@react-hook/window-size';
import { IAsset } from '../TableColumns/assetsColumns';
import { ISensor } from '../TableColumns/sensorsColumns';
import { IAssetType } from '../TableColumns/assetTypesColumns';

const MapContainerStyled = styled(MapContainer)`
    background-color: #212121;

    &.leaflet-container {
        background:  #212121;
        outline: 0;
    }
`;


const TileLayerStyled = styled(TileLayer)`
    filter: grayscale(100%) invert(100%);
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

interface ZoomFrameControlProps {
    initialOuterBounds: number[][];
    resetBuildingSelection: () => void;
    refreshAll: () => void;
}


const ZoomControls: FC<ZoomFrameControlProps> = ({ initialOuterBounds, resetBuildingSelection, refreshAll }) => {
    const map = useMap();

    const clickZoomInHandler = () => {
        map.zoomIn();
    }

    const clickZoomOutHandler = () => {
        map.zoomOut();
    }

    const clickZoomFrameHandler = () => {
        map.fitBounds(initialOuterBounds as LatLngTuple[]);
        resetBuildingSelection();
    }

    const clickReloadHandler = () => {
        refreshAll();
        map.fitBounds(initialOuterBounds as LatLngTuple[]);
        resetBuildingSelection();
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
        </ZoomControlContainer>
    )
}

interface ComponentsControlContainerProps {
    isMobile: boolean;
}


const ComponentsControlContainer = styled.div.withConfig({
	shouldForwardProp: (prop) => prop !== 'isMobile',
  })<ComponentsControlContainerProps>`
    position: absolute;
    z-index: 1000;
    right: 0;
    top: 0;
    width: ${(props) => props.isMobile ? "260px" : "350px"};
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


interface OrgsControlProps {
    orgSelected: IOrgManaged | null;
    selectOrgOption: () => void;
}

const OrgsControl: FC<OrgsControlProps> = ({ orgSelected, selectOrgOption }) => {
    const clickHandler = () => {
        selectOrgOption();
    };

    return (
        <ComponentControlContainer>
            <ComponentLabel>Organization:</ComponentLabel>
            <ComponentSelection>
                <ComponentName>
                    {orgSelected ? orgSelected.acronym : ""}
                </ComponentName>
                <SelectionButton onClick={clickHandler} >Select</SelectionButton>
            </ComponentSelection>
        </ComponentControlContainer>
    )
}

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

interface GroupsControlProps {
    groupSelected: IGroupManaged | null;
    selectGroupOption: () => void;
}

const GroupsControl: FC<GroupsControlProps> = ({ groupSelected, selectGroupOption }) => {

    const clickHandler = () => {
        selectGroupOption();
    };

    return (
        <ComponentControlContainer>
            <ComponentLabel>Group:</ComponentLabel>
            <ComponentSelection>
                <ComponentName>
                    {groupSelected ? groupSelected.acronym : ""}
                </ComponentName>
                <SelectionButton onClick={clickHandler} >Select</SelectionButton>
            </ComponentSelection>
        </ComponentControlContainer>
    )
}

interface AssetsControlProps {
    assetSelected: IAsset | null;
    selectAssetOption: () => void;
}

const AssetsControl: FC< AssetsControlProps> = ({ assetSelected, selectAssetOption }) => {

    const clickHandler = () => {
        selectAssetOption();
    };

    return (
        <ComponentControlContainer>
            <ComponentLabel>Asset:</ComponentLabel>
            <ComponentSelection>
                <ComponentName>
                    {assetSelected ? `Asset_${assetSelected.assetUid}` : ""}
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

interface MapProps {
    buildings: IBuilding[];
    floors: IFloor[];
    orgsOfGroupsManaged: IOrgOfGroupsManaged[];
    groupsManaged: IGroupManaged[];
    assetTypes: IAssetType[];
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
    selectDigitalTwin: (digitalTwinsSelected: IDigitalTwin | null) => void;
    refreshBuildings: () => void;
    refreshFloors: () => void;
    refreshOrgsOfGroupsManaged: () => void;
    refreshGroupsManaged: () => void;
    refreshAssetTypes: () => void;
    refreshAssets: () => void;
    refreshSensors: () => void;
    refreshDigitalTwins: () => void;
    initialOuterBounds: number[][];
    outerBounds: number[][];
    setNewOuterBounds: (outerBounds: number[][]) => void;
    selectOrgOption: () => void;
    selectFloorOption: () => void;
    selectGroupOption: () => void;
    selectAssetOption: () => void;
    resetBuildingSelection: () => void;
    digitalTwinsState: IDigitalTwinState[];
    sensorsState: ISensorState[];
    openDigitalTwin3DViewer: (digitalTwinGltfData: IDigitalTwinGltfData, isGroupDTDemo: boolean) => void;
    setGlftDataLoading: (gtGlftDataLoading: boolean) => void;
}


const Map: FC<MapProps> = (
    {
        buildings,
        floors,
        orgsOfGroupsManaged,
        groupsManaged,
        assetTypes,
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
        digitalTwinSelected,
        selectDigitalTwin,
        refreshBuildings,
        refreshFloors,
        refreshOrgsOfGroupsManaged,
        refreshGroupsManaged,
        refreshAssetTypes,
        refreshAssets,
        refreshSensors,
        refreshDigitalTwins,
        initialOuterBounds,
        outerBounds,
        setNewOuterBounds,
        selectOrgOption,
        selectFloorOption,
        selectGroupOption,
        selectAssetOption,
        resetBuildingSelection,
        digitalTwinsState,
        sensorsState,
        openDigitalTwin3DViewer,
        setGlftDataLoading
    }) => {
    const windowWidth = useWindowWidth();
    const isMobile = windowWidth < 768;

    const refreshAll = useCallback(() => {
        refreshBuildings();
        refreshFloors();
        refreshOrgsOfGroupsManaged();
        refreshGroupsManaged();
        refreshAssetTypes();
        refreshAssets();
        refreshSensors();
        refreshDigitalTwins();
    }, [
        refreshBuildings,
        refreshFloors,
        refreshOrgsOfGroupsManaged,
        refreshGroupsManaged,
        refreshAssetTypes,
        refreshAssets,
        refreshSensors,
        refreshDigitalTwins
    ])

    return (
        <MapContainerStyled maxZoom={30} scrollWheelZoom={true} zoomControl={false} doubleClickZoom={false}>
            <TileLayerStyled
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url='https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
            />
            <MapEvents setNewOuterBounds={setNewOuterBounds} />
            <GeoBuildings
                outerBounds={outerBounds}
                buildings={buildings}
                orgsData={orgsOfGroupsManaged}
                buildingSelected={buildingSelected}
                selectBuilding={selectBuilding}
                floors={floors}
                floorSelected={floorSelected}
                selectFloor={selectFloor}
                orgSelected={orgSelected}
                selectOrg={selectOrg}
                groupSelected={groupSelected}
                groupsManaged={groupsManaged}
                selectGroup={selectGroup}
                digitalTwinsState={digitalTwinsState}
                sensorsState={sensorsState}
            />
            {
                (buildingSelected && orgSelected && floorSelected) &&
                <GeoGroups
                    floorData={floorSelected}
                    orgSelected={orgSelected}
                    selectOrg={selectOrg}
                    groupsInSelectedOrg={groupsManaged.filter(group => group.orgId === orgSelected.id && group.floorNumber === floorSelected.floorNumber)}
                    groupSelected={groupSelected}
                    selectGroup={selectGroup}
                    assetTypes={assetTypes}
                    assetDataArray={assets}
                    assetSelected={assetSelected}
                    selectAsset={selectAsset}
                    sensorDataArray={sensors}
                    sensorSelected={sensorSelected}
                    selectSensor={selectSensor}
                    digitalTwins={digitalTwins}
                    digitalTwinSelected={digitalTwinSelected}
                    selectDigitalTwin={selectDigitalTwin}
                    digitalTwinsState={digitalTwinsState}
                    sensorsState={sensorsState}
                    openDigitalTwin3DViewer={openDigitalTwin3DViewer}
                    setGlftDataLoading={setGlftDataLoading}
                />
            }
            <ControlsContainer>
                <ZoomControls
                    initialOuterBounds={initialOuterBounds}
                    refreshAll={refreshAll}
                    resetBuildingSelection={resetBuildingSelection}
                />
                <ComponentsControlContainer isMobile={isMobile}>
                    <OrgsControl
                        orgSelected={orgSelected}
                        selectOrgOption={selectOrgOption}
                    />
                    {
                        (buildingSelected && orgSelected) &&
                        <FloorsControl
                            floorSelected={floorSelected}
                            selectFloorOption={selectFloorOption}
                        />
                    }
                    {
                        (buildingSelected && orgSelected && floorSelected) &&
                        <GroupsControl
                            groupSelected={groupSelected}
                            selectGroupOption={selectGroupOption}
                        />
                    }
                                        {
                        (buildingSelected && orgSelected && floorSelected && groupSelected) &&
                        <AssetsControl
                            assetSelected={assetSelected}
                            selectAssetOption={selectAssetOption}
                        />
                    }
                </ComponentsControlContainer>
            </ControlsContainer>
        </MapContainerStyled>
    )
}

export default Map;
