import React, { FC, useState, useEffect, FormEvent } from 'react'
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import styled from "styled-components";
import { Polygon } from 'geojson';
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
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    align-items: flex-start;
    width: 35px;
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
    margin: 3px 0;
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


interface ZoomFrameControlProps {
    outerBounds: number[][];
    resetOrgSelection: () => void;
}

const ZoomControls: FC<ZoomFrameControlProps> = ({ outerBounds, resetOrgSelection }) => {
    const map = useMap();

    const clickZoomInHandler = () => {
        map.zoomIn();
    }

    const clickZoomOutHandler = () => {
        map.zoomOut();
    }

    const clickZoomFrameHandler = () => {
        map.fitBounds(outerBounds as LatLngTuple[]);
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


const StyledSelect = styled.select`
    font-size: 14px;
    border: 2px solid #2c3235;
    border-radius: 5px;
    background-color: #0c0d0f;
    color: white;
    padding: 0 10px;
    width: 100%;
    height: 36px;
    min-height: 36px;
    cursor: pointer;
    appearance: none;

    &:hover {
        box-shadow: rgb(20 22 25) 0px 0px 0px 2px, rgb(31 96 196) 0px 0px 0px 4px;
    }

    & option:first-child {
        display: none;
    }

`;

const ComponentsControlContainer = styled.div`
    width: 310px;
    margin: 10px;
`;

const OrgsControlContainer = styled.div`
    width: 300px;
    position: relative;
    display: grid;
    grid-template-areas: "select";
    align-items: center;
    margin: 10px;

    &:after {
        content: "";
        width: 16px;
        height: 8px;
        background-color: white;
        clip-path: polygon(100% 0%, 0 0%, 50% 100%);
        justify-self: end;
        margin-right: 4px;
    }

    & ${StyledSelect},
    &:after {
        grid-area: select;
    }

`;


interface OrgsControlProps {
    orgSelected: IOrgManaged | null;
    selectOrg: (orgSelected: IOrgManaged) => void;
    orgDataArray: IOrgManaged[];

}

const OrgsControl: FC<OrgsControlProps> = ({ orgSelected, selectOrg, orgDataArray }) => {

    const options = orgDataArray.map(orgData => {
        const option = { value: orgData.id, label: orgData.name };
        return option;
    });
    options.splice(0, 0, { value: 0, label: "Select org:" });
    const [selectedOption, setSelectedOption] = useState(options[0].value);

    useEffect(() => {
        if (orgSelected) {
            setSelectedOption(orgSelected.id);
        } else setSelectedOption(0);
    }, [orgSelected])

    const onChange = (e: FormEvent<HTMLSelectElement>) => {
        const option = parseInt(e.currentTarget.value, 10);
        const orgDataArrayFiltered = orgDataArray.filter(org => org.id === option);
        selectOrg(orgDataArrayFiltered[0]);
        setSelectedOption(option);
    };


    return (
        <OrgsControlContainer >
            <StyledSelect onChange={onChange} value={selectedOption} >
                {
                    options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)
                }
            </StyledSelect>
        </OrgsControlContainer>
    )
}


const GroupsControlContainer = styled.div`
    width: 300px;
    position: relative;
    display: grid;
    grid-template-areas: "select";
    align-items: center;
    margin: 10px;

    &:after {
        content: "";
        width: 16px;
        height: 8px;
        background-color: white;
        clip-path: polygon(100% 0%, 0 0%, 50% 100%);
        justify-self: end;
        margin-right: 4px;
    }

    & ${StyledSelect},
    &:after {
        grid-area: select;
    }

`;


interface GroupsControlProps {
    groupSelected: IGroupManaged | null;
    selectGroup: (groupSelected: IGroupManaged) => void;
    groupDataArray: IGroupManaged[];
}

const GroupsControl: FC<GroupsControlProps> = ({ groupSelected, selectGroup, groupDataArray }) => {

    const options = groupDataArray.map(groupData => {
        const option = { value: groupData.id, label: groupData.name };
        return option;
    });
    options.splice(0, 0, { value: 0, label: "Select group:" });
    const [selectedOption, setSelectedOption] = useState(0);

    useEffect(() => {
        if (!groupSelected) setSelectedOption(0);
    }, [groupSelected]);


    const onChange = (e: FormEvent<HTMLSelectElement>) => {
        const option = parseInt(e.currentTarget.value, 10);
        const groupDataArrayFiltered = groupDataArray.filter(group => group.id === option);
        selectGroup(groupDataArrayFiltered[0]);
        setSelectedOption(option);
    };


    return (
        <GroupsControlContainer >
            <StyledSelect onChange={onChange} value={selectedOption} >
                {
                    options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)
                }
            </StyledSelect>
        </GroupsControlContainer>
    )
}

interface MapProps {
    orgsManaged: IOrgManaged[];
    groupsManaged: IGroupManaged[];
    devices: IDevice[];
    refreshOrgsManaged: () => void;
    refreshGroupsManaged: () => void;
    refreshDevices: () => void;
}

const Map: FC<MapProps> = ({ orgsManaged, groupsManaged, devices, refreshOrgsManaged, refreshGroupsManaged, refreshDevices }) => {
    const [outerBounds, setOuterBounds] = useState([[0, 0], [0, 0]]);
    const [orgSelected, setOrgSelected] = useState<IOrgManaged | null>(null);
    const [groupSelected, setGroupSelected] = useState<IGroupManaged | null>(null);
    const [deviceSelected, setDeviceSelected] = useState<IDevice | null>(null);

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

    useEffect(() => {
        let maxLongitude = -180;
        let minLongitude = 180;
        let maxLatitude = -90;
        let minLatitude = 90;
        if (orgsManaged.length !== 0) {
            const geoJsonDataArray = orgsManaged.map(org => org.geoJsonData);
            geoJsonDataArray.forEach(geoJsonData => {
                if (geoJsonData.features && geoJsonData.features.length !== 0) {
                    const coordsArray = (geoJsonData.features[0].geometry as Polygon).coordinates[0];
                    coordsArray.forEach(coords => {
                        if (coords[0] > maxLongitude) maxLongitude = coords[0];
                        if (coords[0] < minLongitude) minLongitude = coords[0];
                        if (coords[1] > maxLatitude) maxLatitude = coords[1];
                        if (coords[1] < minLatitude) minLatitude = coords[1];
                    })
                }
                const outerBounds = [[minLatitude, minLongitude], [maxLatitude, maxLongitude]];
                setOuterBounds(outerBounds);
            })
        } else {
            const spainOuterBounds = [[35.55010533588552,-10.56884765625], [44.134913443750726, 1.42822265625]];
            setOuterBounds(spainOuterBounds);
        }

        
    }, [orgsManaged])

    return (
        <MapContainer center={[41.413786922165556, 2.2225694835034266]} zoom={17} maxZoom={30} scrollWheelZoom={true} zoomControl={false} doubleClickZoom={false} >
            {/* <TileLayer
                attribution='&copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                maxZoom={19}
            /> */}
            <TileLayer
                attribution='&copy; <a href="https://stadiamaps.com/">Stadia Maps</a>, &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors'
                url='https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png'
                maxZoom={19}
            />
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
                <ZoomControls outerBounds={outerBounds} resetOrgSelection={resetOrgSelection} />
                <ComponentsControlContainer>
                    <OrgsControl orgDataArray={orgsManaged} orgSelected={orgSelected} selectOrg={selectOrg} />
                    {
                        orgSelected &&
                        <GroupsControl groupDataArray={groupsManaged} groupSelected={groupSelected} selectGroup={selectGroup} />
                    }
                </ComponentsControlContainer>
            </ControlsContainer>
        </MapContainer >
    )
}

export default Map;
