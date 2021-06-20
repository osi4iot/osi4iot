import { FC, useEffect, useState, useCallback } from 'react'
import styled from "styled-components";
import { Polygon } from 'geojson';
import { axiosAuth, getDomainName, axiosInstance } from '../../tools/tools';
import { useAuthState, useAuthDispatch } from '../../contexts/authContext';
import Loader from "../Tools/Loader";
import { PLATFORM_ASSISTANT_HOME_OPTIONS } from './platformAssistantOptions';
import {
    usePlatformAssitantDispatch,
    useGroupsManagedTable,
    useDevicesTable,
    useOrgsManagedTable,
    setOrgsManagedTable,
    setGroupsManagedTable,
    setDevicesTable,
} from '../../contexts/platformAssistantContext';
import Tutorial from './Tutorial';
import DigitalTwins from './DigitalTwins';
import { IOrgManaged } from './TableColumns/organizationsManagedColumns';
import GeolocationContainer from './GeolocationContainer';
import { IGroupManaged } from './TableColumns/groupsManagedColumns';
import { IDevice } from './TableColumns/devicesColumns';


const PlatformAssistantHomeOptionsContainer = styled.div`
	display: flex;
	flex-direction: row;
    justify-content: flex-start;
	align-items: center;
    width: 60%;
    height: 50px;
    background-color: #0c0d0f;
`;

interface OptionContainerProps {
    isOptionActive: boolean;
}

const OptionContainer = styled.div<OptionContainerProps>`
	color: "white";
    margin: 10px 20px 0 20px;
    background-color: ${(props) => props.isOptionActive ? "#202226" : "#0c0d0f"};
    padding: 10px 10px 10px 10px;
    border-top: ${(props) => props.isOptionActive ? "3px solid #3274d9;" : "3px solid #0c0d0f"};
    align-content: center;

    &:hover {
        cursor: pointer;
        background-color: #202226;
        border-top: ${(props) => props.isOptionActive ? "3px solid #3274d9;" : "3px solid white"};
    }
`;

const ContentContainer = styled.div`
    width: calc(100vw - 75px);
    height: calc(100vh - 200px);
    background-color: #202226;
    margin-bottom: 5px;
    display: flex;
	flex-direction: column;
    justify-content: flex-start;
	align-items: center;
    overflow: auto;

    /* width */
    ::-webkit-scrollbar {
        width: 10px;
        height: 10px;
    }

    /* Track */
    ::-webkit-scrollbar-track {
        background: #202226;
        border-radius: 5px;
    }
    
    /* Handle */
    ::-webkit-scrollbar-thumb {
        background: #2c3235; 
        border-radius: 5px;
    }

    /* Handle on hover */
    ::-webkit-scrollbar-thumb:hover {
        background-color: #343840;
    }

    ::-webkit-scrollbar-corner {
        /* background-color: #0c0d0f; */
        background: #202226;
    }

`;

const filterOrgsManaged = (orgsManaged: IOrgManaged[]) => {
    const condition = (orgManaged: IOrgManaged) => !(orgManaged.geoJsonData === null || Object.keys(orgManaged.geoJsonData).length === 0);
    const orgsManagedFiltered = orgsManaged.filter(condition);
    return orgsManagedFiltered;
}

const findBounds = (orgsManaged: IOrgManaged[]) => {
    let outerBounds: number[][] = [[35.55010533588552, -10.56884765625], [44.134913443750726, 1.42822265625]];
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
            outerBounds = [[minLatitude, minLongitude], [maxLatitude, maxLongitude]];
        })
    } else {
        let minMapLatitude = 35.55010533588552;
        let maxMapLatitude = 44.134913443750726;
        let minMapLongitude = -10.56884765625;
        let maxMapLongitude = 1.42822265625;
        if (window._env_.MIN_LONGITUDE) {
            minMapLongitude = window._env_.minLongitude;
        }
        if (window._env_.MAX_LONGITUDE) {
            maxMapLongitude = window._env_.maxLongitude;
        }
        if (window._env_.MIN_LATITUDE) {
            minMapLatitude = window._env_.minLatitude;
        }
        if (window._env_.MAX_LATITUDE) {
            maxMapLatitude = window._env_.maxLatitude;
        }
        outerBounds = [[minMapLatitude, minMapLongitude], [maxMapLatitude, maxMapLongitude]];
    }

    return outerBounds;
}

const domainName = getDomainName();

const PlatformAssistantHomeOptions: FC<{}> = () => {
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();
    const plaformAssistantDispatch = usePlatformAssitantDispatch();
    const orgsManagedTable = useOrgsManagedTable();
    const groupsManagedTable = useGroupsManagedTable();
    const devicesTable = useDevicesTable();
    const [orgsManagedLoading, setOrgsManagedLoading] = useState(true);
    const [groupsManagedLoading, setGroupsManagedLoading] = useState(true);
    const [deviceLoading, setDevicesLoading] = useState(true);
    const [optionToShow, setOptionToShow] = useState(PLATFORM_ASSISTANT_HOME_OPTIONS.GEOLOCATION);
    const [reloadOrgsManaged, setReloadOrgsManaged] = useState(false);
    const [reloadGroupsManaged, setReloadGroupsManaged] = useState(false);
    const [reloadDevices, setReloadDevices] = useState(false);
    const [initialOuterBounds, setInitialOuterBounds] = useState([[0, 0], [0, 0]]);
    const [outerBounds, setOuterBounds] = useState([[0, 0], [0, 0]]);
    const [orgsManagedFiltered, setOrgsManagedFiltered] = useState<IOrgManaged[]>([]);
    const [orgSelected, setOrgSelected] = useState<IOrgManaged | null>(null);
    const [groupSelected, setGroupSelected] = useState<IGroupManaged | null>(null);
    const [deviceSelected, setDeviceSelected] = useState<IDevice | null>(null);

    const refreshOrgsManaged = useCallback(() => {
        setReloadOrgsManaged(true);
        setOrgsManagedLoading(true);
        setTimeout(() => setReloadOrgsManaged(false), 500);
    }, [])

    const refreshGroupsManaged = useCallback(() => {
        setReloadGroupsManaged(true);
        setGroupsManagedLoading(true);
        setTimeout(() => setReloadGroupsManaged(false), 500);
    }, []);


    const refreshDevices = useCallback(() => {
        setReloadDevices(true);
        setDevicesLoading(true);
        setTimeout(() => setReloadDevices(false), 500);
    }, [])

    const setNewOuterBounds = (outerBounds: number[][]) => {
        setOuterBounds(outerBounds);
    }

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
        if (orgsManagedTable.length !== 0) {
            const orgsManagedFiltered = filterOrgsManaged(orgsManagedTable);
            setOrgsManagedFiltered(orgsManagedFiltered);
            const outerBounds = findBounds(orgsManagedFiltered);
            setOuterBounds(outerBounds);
            setInitialOuterBounds(outerBounds);
        }
    }, [orgsManagedTable]);


    useEffect(() => {
        if (orgsManagedTable.length === 0 || reloadOrgsManaged) {
            const urlOrgsManaged = `https://${domainName}/admin_api/organizations/user_managed/`;
            const config = axiosAuth(accessToken);
            axiosInstance(refreshToken, authDispatch)
                .get(urlOrgsManaged, config)
                .then((response) => {
                    const orgsManaged = response.data;
                    setOrgsManagedTable(plaformAssistantDispatch, { orgsManaged });
                    setOrgsManagedLoading(false);
                    const orgsManagedFiltered = filterOrgsManaged(orgsManaged);
                    setOrgsManagedFiltered(orgsManagedFiltered);
                    const outerBounds = findBounds(orgsManagedFiltered);
                    setOuterBounds(outerBounds);
                    setInitialOuterBounds(outerBounds);
                })
                .catch((error) => {
                    console.log(error);
                });
        } else {
            setOrgsManagedLoading(false);
        }
    }, [accessToken, refreshToken, authDispatch, plaformAssistantDispatch, reloadOrgsManaged, orgsManagedTable.length]);

    useEffect(() => {
        if (groupsManagedTable.length === 0 || reloadGroupsManaged) {
            const config = axiosAuth(accessToken);
            const urlGroupsManaged = `https://${domainName}/admin_api/groups/user_managed`;
            axiosInstance(refreshToken, authDispatch)
                .get(urlGroupsManaged, config)
                .then((response) => {
                    const groupsManaged = response.data;
                    groupsManaged.map((group: { isOrgDefaultGroup: string; }) => {
                        group.isOrgDefaultGroup = group.isOrgDefaultGroup ? "Default" : "Generic";
                        return group;
                    })
                    setGroupsManagedTable(plaformAssistantDispatch, { groupsManaged });
                    setGroupsManagedLoading(false);
                })
                .catch((error) => {
                    console.log(error);
                });
        } else {
            setGroupsManagedLoading(false);
        }
    }, [accessToken, refreshToken, authDispatch, plaformAssistantDispatch, reloadGroupsManaged, groupsManagedTable.length]);

    useEffect(() => {
        if (devicesTable.length === 0 || reloadDevices) {
            const config = axiosAuth(accessToken);
            const urlDevices = `https://${domainName}/admin_api/devices/user_managed`;
            axiosInstance(refreshToken, authDispatch)
                .get(urlDevices, config)
                .then((response) => {
                    const devices = response.data;
                    devices.map((device: { isDefaultGroupDevice: string; }) => {
                        device.isDefaultGroupDevice = device.isDefaultGroupDevice ? "Default" : "Generic";
                        return device;
                    })
                    setDevicesTable(plaformAssistantDispatch, { devices });
                    setDevicesLoading(false);
                })
                .catch((error) => {
                    console.log(error);
                });
        } else {
            setDevicesLoading(false);
        }
    }, [accessToken, refreshToken, authDispatch, plaformAssistantDispatch, reloadDevices, devicesTable.length]);

    const clickHandler = (optionToShow: string) => {
        setOptionToShow(optionToShow);
    }

    return (
        <>
            <PlatformAssistantHomeOptionsContainer>
                <OptionContainer isOptionActive={optionToShow === PLATFORM_ASSISTANT_HOME_OPTIONS.GEOLOCATION} onClick={() => clickHandler(PLATFORM_ASSISTANT_HOME_OPTIONS.GEOLOCATION)}>
                    Geolocation
                </OptionContainer>
                <OptionContainer isOptionActive={optionToShow === PLATFORM_ASSISTANT_HOME_OPTIONS.DIGITAL_TWINS} onClick={() => clickHandler(PLATFORM_ASSISTANT_HOME_OPTIONS.DIGITAL_TWINS)}>
                    Digital twins
                </OptionContainer>
                <OptionContainer isOptionActive={optionToShow === PLATFORM_ASSISTANT_HOME_OPTIONS.TUTORIAL} onClick={() => clickHandler(PLATFORM_ASSISTANT_HOME_OPTIONS.TUTORIAL)}>
                    Tutorial
                </OptionContainer>
            </PlatformAssistantHomeOptionsContainer>
            <ContentContainer >
                <>
                    {(orgsManagedLoading || groupsManagedLoading || deviceLoading) ?
                        <Loader />
                        :
                        <>
                            {optionToShow === PLATFORM_ASSISTANT_HOME_OPTIONS.GEOLOCATION &&
                                <GeolocationContainer
                                    orgsManaged={orgsManagedFiltered}
                                    groupsManaged={groupsManagedTable}
                                    devices={devicesTable}
                                    orgSelected={orgSelected}
                                    selectOrg={selectOrg}
                                    groupSelected={groupSelected}
                                    selectGroup={selectGroup}
                                    deviceSelected={deviceSelected}
                                    selectDevice={selectDevice}
                                    refreshOrgsManaged={refreshOrgsManaged}
                                    refreshGroupsManaged={refreshGroupsManaged}
                                    refreshDevices={refreshDevices}
                                    initialOuterBounds={initialOuterBounds}
                                    outerBounds={outerBounds}
                                setNewOuterBounds={setNewOuterBounds}
                                resetOrgSelection={resetOrgSelection}
                                />
                            }
                            {optionToShow === PLATFORM_ASSISTANT_HOME_OPTIONS.DIGITAL_TWINS &&
                                <DigitalTwins />
                            }
                            {
                                optionToShow === PLATFORM_ASSISTANT_HOME_OPTIONS.TUTORIAL &&
                                <Tutorial />
                            }
                        </>
                    }
                </>
            </ContentContainer>
        </>
    )
}

export default PlatformAssistantHomeOptions;
