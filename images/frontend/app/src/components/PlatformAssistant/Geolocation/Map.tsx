import { FC, useState, useEffect, FormEvent } from 'react'
import 'react-rangeslider/lib/index.css'
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
    orgSelected: IOrgManaged;
    groupSelected: IGroupManaged | null;
    selectGroup: (groupSelected: IGroupManaged) => void;
    groupDataArray: IGroupManaged[];
}

interface IOption {
    value: number;
    label: string;
}

const findGroupsArrayForOrgId = (groupDataArray: IGroupManaged[], orgId: number): IGroupManaged[] => {
    const groupDataFiltered = groupDataArray.filter(groupData => groupData.orgId === orgId);
    return groupDataFiltered;
}

const giveOptions = (groupsArrayForOrgId: IGroupManaged[]): IOption[] => {
    const options: IOption[] = groupsArrayForOrgId.map(groupData => {
        const option = { value: groupData.id, label: groupData.name };
        return option;
    });
    options.splice(0, 0, { value: 0, label: "Select group:" });
    return options;
}

const GroupsControl: FC<GroupsControlProps> = ({ orgSelected, groupSelected, selectGroup, groupDataArray }) => {
    const groupsArrayForOrgId = findGroupsArrayForOrgId(groupDataArray, orgSelected.id);
    const options = giveOptions(groupsArrayForOrgId);
    const [selectedOption, setSelectedOption] = useState(0);

    useEffect(() => {
        if (!groupSelected) setSelectedOption(0);
    }, [groupSelected]);


    const onChange = (e: FormEvent<HTMLSelectElement>) => {
        const option = parseInt(e.currentTarget.value, 10);
        const groupDataArrayFiltered = groupsArrayForOrgId.filter(group => group.id === option);
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
    const [orgsManagedFiltered, setOrgsManagedFiltered] = useState<IOrgManaged[]>([]);

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
        const condition = (orgManaged: IOrgManaged) => !(orgManaged.geoJsonData === null || Object.keys(orgManaged.geoJsonData).length === 0);
        const orgsManagedFiltered = orgsManaged.filter(condition);
        setOrgsManagedFiltered(orgsManagedFiltered);
        if (orgsManagedFiltered.length !== 0) {
            const geoJsonDataArray = orgsManagedFiltered.map(org => org.geoJsonData);
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
            let minLatitude = 35.55010533588552;
            let maxLatitude = 44.134913443750726;
            let minLongitude = -10.56884765625;
            let maxLongitude = 1.42822265625;
            if (window._env_.MIN_LONGITUDE) {
                minLongitude = window._env_.minLongitude;
            }
            if (window._env_.MAX_LONGITUDE) {
                maxLongitude = window._env_.maxLongitude;
            }
            if (window._env_.MIN_LATITUDE) {
                minLatitude = window._env_.minLatitude;
            }
            if (window._env_.MAX_LATITUDE) {
                maxLatitude = window._env_.maxLatitude;
            }
            const outerBounds = [[minLatitude, minLongitude], [maxLatitude, maxLongitude]];
            setOuterBounds(outerBounds);
        }
    }, [orgsManaged])

    return (
        <MapContainerStyled center={[41.413786922165556, 2.2225694835034266]} zoom={17} maxZoom={30} scrollWheelZoom={true} zoomControl={false} doubleClickZoom={false} >
            <TileLayerStyled
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url='https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
            />
            <GeoOrgs
                outerBounds={outerBounds}
                orgDataArray={orgsManagedFiltered}
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
                        <GroupsControl orgSelected={orgSelected} groupDataArray={groupsManaged} groupSelected={groupSelected} selectGroup={selectGroup} />
                    }
                </ComponentsControlContainer>
            </ControlsContainer>
        </MapContainerStyled>
    )
}

export default Map;
