import { FC } from 'react'
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
import GeoOrgs from './GeoOrgs';
import GeoGroup from './GeoGroup';
import { IOrgManaged } from '../TableColumns/organizationsManagedColumns';
import { IGroupManaged } from '../TableColumns/groupsManagedColumns';
import { IDevice } from '../TableColumns/devicesColumns';
import { IOrgOfGroupsManaged } from '../TableColumns/orgsOfGroupsManagedColumns';


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
    resetOrgSelection: () => void;
    refreshAll: () => void;
}


const ZoomControls: FC<ZoomFrameControlProps> = ({ initialOuterBounds, resetOrgSelection, refreshAll }) => {
    const map = useMap();

    const clickZoomInHandler = () => {
        map.zoomIn();
    }

    const clickZoomOutHandler = () => {
        map.zoomOut();
    }

    const clickZoomFrameHandler = () => {
        map.fitBounds(initialOuterBounds as LatLngTuple[]);
        resetOrgSelection();
    }

    const clickReloadHandler = () => {
        refreshAll();
        map.fitBounds(initialOuterBounds as LatLngTuple[]);
        resetOrgSelection();
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


const ComponentsControlContainer = styled.div`
    position: absolute;
    z-index: 1000;
    right: 0;
    top: 0;
    width: 350px;
    margin: 15px;
    padding: 0px 10px 10px;
    border: 2px solid #3274d9;
    border-radius: 15px;
    background-color: #202226;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    align-items: center;
`;

const ComponentControlContainer = styled.div`
    margin: 10px;
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

interface DevicesControlProps {
    deviceSelected: IDevice | null;
    selectDeviceOption: () => void;
}

const DevicesControl: FC<DevicesControlProps> = ({ deviceSelected, selectDeviceOption }) => {

    const clickHandler = () => {
        selectDeviceOption();
    };

    return (
        <ComponentControlContainer>
            <ComponentLabel>Device:</ComponentLabel>
            <ComponentSelection>
                <ComponentName>
                    {deviceSelected ? deviceSelected.name : ""}
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
    orgsOfGroupsManaged: IOrgOfGroupsManaged[]
    groupsManaged: IGroupManaged[];
    devices: IDevice[];
    orgSelected: IOrgManaged | null;
    selectOrg: (orgSelected: IOrgManaged) => void;
    groupSelected: IGroupManaged | null;
    selectGroup: (groupSelected: IGroupManaged) => void;
    deviceSelected: IDevice | null;
    selectDevice: (deviceSelected: IDevice) => void;
    refreshOrgsOfGroupsManaged: () => void;
    refreshGroupsManaged: () => void;
    refreshDevices: () => void;
    initialOuterBounds: number[][];
    outerBounds: number[][];
    setNewOuterBounds: (outerBounds: number[][]) => void;
    selectOrgOption: () => void;
    selectGroupOption: () => void;
    selectDeviceOption: () => void;
    selectDigitalTwinOption: () => void;
    resetOrgSelection: () => void;
}


const Map: FC<MapProps> = (
    {
        orgsOfGroupsManaged,
        groupsManaged,
        devices,
        orgSelected,
        selectOrg,
        groupSelected,
        selectGroup,
        deviceSelected,
        selectDevice,
        refreshOrgsOfGroupsManaged,
        refreshGroupsManaged,
        refreshDevices,
        initialOuterBounds,
        outerBounds,
        setNewOuterBounds,
        selectOrgOption,
        selectGroupOption,
        selectDeviceOption,
        selectDigitalTwinOption,
        resetOrgSelection
    }) => {
    
    const refreshAll = () => {
        refreshOrgsOfGroupsManaged();
        refreshGroupsManaged();
        refreshDevices();
    }

    return (
        <MapContainerStyled maxZoom={30} scrollWheelZoom={true} zoomControl={false} doubleClickZoom={false} >
            <TileLayerStyled
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url='https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
            />
            <MapEvents setNewOuterBounds={setNewOuterBounds} />
            <GeoOrgs
                outerBounds={outerBounds}
                orgDataArray={orgsOfGroupsManaged}
                orgSelected={orgSelected}
                selectOrg={selectOrg}
                groupSelected={groupSelected}
            />
            {
                (orgSelected && groupSelected) &&
                <GeoGroup orgData={orgSelected} groupData={groupSelected} deviceDataArray={devices} deviceSelected={deviceSelected} selectDevice={selectDevice} />

            }
            <ControlsContainer>
                <ZoomControls initialOuterBounds={initialOuterBounds} refreshAll={refreshAll} resetOrgSelection={resetOrgSelection} />
                <ComponentsControlContainer>
                    <OrgsControl
                        orgSelected={orgSelected}
                        selectOrgOption={selectOrgOption}
                    />
                    {
                        orgSelected &&
                        <GroupsControl
                            groupSelected={groupSelected}
                            selectGroupOption={selectGroupOption}
                        />
                    }
                    {
                        (orgSelected && groupSelected) &&
                        <DevicesControl
                            deviceSelected={deviceSelected}
                            selectDeviceOption={selectDeviceOption}
                        />
                    }                    
                </ComponentsControlContainer>
            </ControlsContainer>
        </MapContainerStyled>
    )
}

export default Map;
