import { FC } from 'react'
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import styled from "styled-components";
import { MdZoomOutMap } from "react-icons/md";
import { RiZoomInLine, RiZoomOutLine } from "react-icons/ri";
import { LatLngTuple } from 'leaflet';
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
import GeoOrgs from './GeoOrgs';
import GeoGroup from './GeoGroup';
import { IOrgManaged } from '../TableColumns/organizationsManagedColumns';
import { IGroupManaged } from '../TableColumns/groupsManagedColumns';
import { IDevice } from '../TableColumns/devicesColumns';


const MapContainerStyled = styled(MapContainer)`
    background-color: #212121;
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
    position: relative;
    z-index: 800;
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    align-items: flex-start;
    width: 100%;
`;

const ZoomControlContainer = styled.div`
    margin: 10px;
    padding: 10px 0;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    align-items: flex-start;
    border: 3px solid #2c3235;
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
}


const ZoomControls: FC<ZoomFrameControlProps> = ({ initialOuterBounds, resetOrgSelection }) => {
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
        </ZoomControlContainer>
    )
}


const ComponentsControlContainer = styled.div`
    width: 310px;
    margin: 10px;
    padding: 0px 10px 10px;
    border: 3px solid #2c3235;
    border-radius: 15px;
    background-color: #202226;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    align-items: center;
`;

const ComponentControlContainer = styled.div`
    width: 100%;
    margin: 10px;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    align-items: flex-start;
`;

const ComponentSelection = styled.div`
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
    margin: 5px;
    width: 99%;
`;

const ComponentLabel = styled.div`
    font-size: 14px;
`;

const SelectionButton = styled.button`
    font-size: 14px;
    border: 1px solid #2c3235;
    border-radius: 10px;
    background-color: #0c0d0f;
    color: white;
    cursor: pointer;
    padding: 5px 20px;
    width: 120px;

    &:hover {
		color: #3274d9;
        border: 1px solid #3274d9;
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
    width: 100%;
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
            <ComponentSelection>
                <ComponentLabel>Organization:</ComponentLabel>
                <SelectionButton onClick={clickHandler} >Select org</SelectionButton>
            </ComponentSelection>
            <ComponentName>
                {orgSelected ? orgSelected.name : ""}
            </ComponentName>
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
            <ComponentSelection>
                <ComponentLabel>Group:</ComponentLabel>
                <SelectionButton onClick={clickHandler} >Select group</SelectionButton>
            </ComponentSelection>
            <ComponentName>
                {groupSelected ? groupSelected.name : ""}
            </ComponentName>
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
    orgsManaged: IOrgManaged[];
    groupsManaged: IGroupManaged[];
    devices: IDevice[];
    orgSelected: IOrgManaged | null;
    setOrgSelected: (orgSelected: IOrgManaged | null) => void;
    groupSelected: IGroupManaged | null;
    setGroupSelected: (groupSelected: IGroupManaged | null) => void;
    deviceSelected: IDevice | null;
    setDeviceSelected: (deviceSelected: IDevice | null) => void;
    refreshOrgsManaged: () => void;
    refreshGroupsManaged: () => void;
    refreshDevices: () => void;
    initialOuterBounds: number[][];
    outerBounds: number[][];
    setNewOuterBounds: (outerBounds: number[][]) => void;
    selectOrgOption: () => void;
    selectGroupOption: () => void;
}


const Map: FC<MapProps> = (
    {
        orgsManaged,
        groupsManaged,
        devices,
        orgSelected,
        setOrgSelected,
        groupSelected,
        setGroupSelected,
        deviceSelected,
        setDeviceSelected,
        refreshOrgsManaged,
        refreshGroupsManaged,
        refreshDevices,
        initialOuterBounds,
        outerBounds,
        setNewOuterBounds,
        selectOrgOption,
        selectGroupOption
    }) => {

    const selectOrg = (org: IOrgManaged) => {
        setOrgSelected(org);
        setGroupSelected(null);
        setDeviceSelected(null);
    }

    const selectGroup = (group: IGroupManaged) => {
        setGroupSelected(group);
        setDeviceSelected(null);
    }

    const selectDevice = (device: IDevice) => {
        setDeviceSelected(device);
    }

    const resetOrgSelection = () => {
        setOrgSelected(null);;
        setGroupSelected(null);
        setDeviceSelected(null);
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
                orgDataArray={orgsManaged}
                orgSelected={orgSelected}
                selectOrg={selectOrg}
                groupSelected={groupSelected}
            />
            {
                (orgSelected && groupSelected) &&
                <GeoGroup orgData={orgSelected} groupData={groupSelected} deviceDataArray={devices} deviceSelected={deviceSelected} selectDevice={selectDevice} />

            }
            <ControlsContainer>
                <ZoomControls initialOuterBounds={initialOuterBounds} resetOrgSelection={resetOrgSelection} />
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
                </ComponentsControlContainer>
            </ControlsContainer>
        </MapContainerStyled>
    )
}

export default Map;
