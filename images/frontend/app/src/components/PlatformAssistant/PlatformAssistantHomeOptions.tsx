import { FC, useEffect, useState, useCallback, Suspense } from 'react'
import styled from "styled-components";
import { axiosAuth, getDomainName, axiosInstance } from '../../tools/tools';
import { useAuthState, useAuthDispatch } from '../../contexts/authContext';
import Loader from "../Tools/Loader";
import { PLATFORM_ASSISTANT_HOME_OPTIONS } from './platformAssistantOptions';
import {
	usePlatformAssitantDispatch,
	useGroupsManagedTable,
	useDevicesTable,
	setGroupsManagedTable,
	setDevicesTable,
	useOrgsOfGroupsManagedTable,
	setOrgsOfGroupsManagedTable,
	useDigitalTwinsTable,
	setDigitalTwinsTable,
	useBuildingsTable,
	useFloorsTable,
	setBuildingsTable,
	setFloorsTable,
} from '../../contexts/platformAssistantContext';
import Tutorial from './Tutorial';
import GeolocationContainer from './GeolocationContainer';
import { IGroupManaged } from './TableColumns/groupsManagedColumns';
import { IDevice } from './TableColumns/devicesColumns';
import { IDigitalTwin } from './TableColumns/digitalTwinsColumns';
import { IBuilding } from './TableColumns/buildingsColumns';
import { IFloor } from './TableColumns/floorsColumns';
import { filterBuildings } from '../../tools/filterBuildings';
import { filterFloors } from '../../tools/filterFloors';
import { IOrgOfGroupsManaged } from './TableColumns/orgsOfGroupsManagedColumns';
import DigitalTwin3DViewer from './DigitalTwin3DViewer/DigitalTwin3DViewer';
import { toast } from 'react-toastify';
import { IDigitalTwinGltfData } from './DigitalTwin3DViewer/ViewerUtils';
// import DigitalTwins from './DigitalTwins';


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



const findBounds = (buildings: IBuilding[]) => {
	let outerBounds: number[][] = [[35.55010533588552, -10.56884765625], [44.134913443750726, 1.42822265625]];
	let maxLongitude = -180;
	let minLongitude = 180;
	let maxLatitude = -90;
	let minLatitude = 90;
	if (buildings.length !== 0) {
		const buildingsOuterBounds = buildings.map(building => building.outerBounds);
		buildingsOuterBounds.forEach(buildingOuterBounds => {
			if (buildingOuterBounds[1][1] > maxLongitude) maxLongitude = buildingOuterBounds[1][1];
			if (buildingOuterBounds[0][1] < minLongitude) minLongitude = buildingOuterBounds[0][1];
			if (buildingOuterBounds[1][0] > maxLatitude) maxLatitude = buildingOuterBounds[1][0];
			if (buildingOuterBounds[0][0] < minLatitude) minLatitude = buildingOuterBounds[0][0];
			outerBounds = [[minLatitude, minLongitude], [maxLatitude, maxLongitude]];
		})
	} else {
		let minMapLatitude = 35.55010533588552;
		let maxMapLatitude = 44.134913443750726;
		let minMapLongitude = -10.56884765625;
		let maxMapLongitude = 1.42822265625;
		if (window._env_.MIN_LONGITUDE) {
			minMapLongitude = parseFloat(window._env_.MIN_LONGITUDE);
		}
		if (window._env_.MAX_LONGITUDE) {
			maxMapLongitude = parseFloat(window._env_.MAX_LONGITUDE);
		}
		if (window._env_.MIN_LATITUDE) {
			minMapLatitude = parseFloat(window._env_.MIN_LATITUDE);
		}
		if (window._env_.MAX_LATITUDE) {
			maxMapLatitude = parseFloat(window._env_.MAX_LATITUDE);
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
	const buildingsTable = useBuildingsTable();
	const floorsTable = useFloorsTable();
	const orgsOfGroupsManagedTable = useOrgsOfGroupsManagedTable();
	const groupsManagedTable = useGroupsManagedTable();
	const devicesTable = useDevicesTable();
	const digitalTwinsTable = useDigitalTwinsTable();
	const [buildingsLoading, setBuildingsLoading] = useState(true);
	const [floorsLoading, setFloorsLoading] = useState(true);
	const [orgsOfGroupsManagedLoading, setOrgsOfGroupsManagedLoading] = useState(true);
	const [groupsManagedLoading, setGroupsManagedLoading] = useState(true);
	const [deviceLoading, setDevicesLoading] = useState(true);
	const [digitalTwinLoading, setDigitalTwinsLoading] = useState(true);
	const [digitalTwinGltfData, setDigitalTwinGltfData] = useState<IDigitalTwinGltfData | null>(null);
	const [optionToShow, setOptionToShow] = useState(PLATFORM_ASSISTANT_HOME_OPTIONS.GEOLOCATION);
	const [reloadBuildings, setReloadBuildings] = useState(false);
	const [reloadFloors, setReloadloors] = useState(false);
	const [reloadOrgsOfGroupsManaged, setReloadOrgsOfGroupsManaged] = useState(false);
	const [reloadGroupsManaged, setReloadGroupsManaged] = useState(false);
	const [reloadDevices, setReloadDevices] = useState(false);
	const [reloadDigitalTwins, setReloadDigitalTwins] = useState(false);
	const [initialOuterBounds, setInitialOuterBounds] = useState([[0, 0], [0, 0]]);
	const [outerBounds, setOuterBounds] = useState([[0, 0], [0, 0]]);
	const [buildingsFiltered, setBuildingsFiltered] = useState<IBuilding[]>([]);
	const [floorsFiltered, setFloorsFiltered] = useState<IFloor[]>([]);
	const [buildingSelected, setBuildingSelected] = useState<IBuilding | null>(null);
	const [floorSelected, setFloorSelected] = useState<IFloor | null>(null);
	const [orgSelected, setOrgSelected] = useState<IOrgOfGroupsManaged | null>(null);
	const [groupSelected, setGroupSelected] = useState<IGroupManaged | null>(null);
	const [deviceSelected, setDeviceSelected] = useState<IDevice | null>(null);
	const [digitalTwinSelected, setDigitalTwinSelected] = useState<IDigitalTwin | null>(null);

	const refreshBuildings = useCallback(() => {
		setReloadBuildings(true);
		setBuildingsLoading(true);
		setTimeout(() => setReloadBuildings(false), 500);
	}, [])

	const refreshFloors = useCallback(() => {
		setReloadloors(true);
		setFloorsLoading(true);
		setTimeout(() => setReloadloors(false), 500);
	}, [])

	const refreshOrgsOfGroupsManaged = useCallback(() => {
		setReloadOrgsOfGroupsManaged(true);
		setOrgsOfGroupsManagedLoading(true);
		setTimeout(() => setReloadOrgsOfGroupsManaged(false), 500);
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

	const refreshDigitalTwins = useCallback(() => {
		setReloadDigitalTwins(true);
		setDigitalTwinsLoading(true);
		setTimeout(() => setReloadDigitalTwins(false), 500);
	}, [])

	const openDigitalTwin3DViewer = useCallback((digitalTwinGltfData: IDigitalTwinGltfData) => {
		setDigitalTwinGltfData(digitalTwinGltfData)
		setOptionToShow(PLATFORM_ASSISTANT_HOME_OPTIONS.DIGITAL_TWINS)

	}, [])


	const setNewOuterBounds = (outerBounds: number[][]) => {
		setOuterBounds(outerBounds);
	}

	const selectBuilding = (building: IBuilding) => {
		setBuildingSelected(building);
	}


	const selectFloor = (floor: IFloor) => {
		setFloorSelected(floor);
	}

	const selectOrg = (org: IOrgOfGroupsManaged) => {
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

	const selectDigitalTwin = (digitalTwin: IDigitalTwin) => {
		setDigitalTwinSelected(digitalTwin);
	}

	const resetBuildingSelection = () => {
		setBuildingSelected(null);
		setFloorSelected(null);
		setOrgSelected(null);;
		setGroupSelected(null);
		setDeviceSelected(null);
	}


	useEffect(() => {
		if (buildingsTable.length !== 0) {
			const buildingsFiltered = filterBuildings(buildingsTable);
			setBuildingsFiltered(buildingsFiltered);
			const outerBounds = findBounds(buildingsFiltered);
			setOuterBounds(outerBounds);
			setInitialOuterBounds(outerBounds);
		}
	}, [buildingsTable]);

	useEffect(() => {
		if (floorsTable.length !== 0) {
			const floorsFiltered = filterFloors(floorsTable);
			setFloorsFiltered(floorsFiltered);
		}
	}, [floorsTable]);


	useEffect(() => {
		if (buildingsTable.length === 0 || reloadBuildings) {
			const urlBuildings = `https://${domainName}/admin_api/buildings/user_groups_managed/`;
			const config = axiosAuth(accessToken);
			axiosInstance(refreshToken, authDispatch)
				.get(urlBuildings, config)
				.then((response) => {
					const buildings = response.data;
					setBuildingsTable(plaformAssistantDispatch, { buildings });
					setBuildingsLoading(false);
					const buildingsFiltered = filterBuildings(buildings);
					setBuildingsFiltered(buildingsFiltered);
					const outerBounds = findBounds(buildingsFiltered);
					setOuterBounds(outerBounds);
					setInitialOuterBounds(outerBounds);
				})
				.catch((error) => {
					console.log(error);
				});
		} else {
			setBuildingsLoading(false);
		}
	}, [
		accessToken,
		refreshToken,
		authDispatch,
		plaformAssistantDispatch,
		reloadBuildings,
		buildingsTable.length
	]);

	useEffect(() => {
		if (floorsTable.length === 0 || reloadFloors) {
			const urlFloors = `https://${domainName}/admin_api/building_floors/user_groups_managed/`;
			const config = axiosAuth(accessToken);
			axiosInstance(refreshToken, authDispatch)
				.get(urlFloors, config)
				.then((response) => {
					const floors = response.data;
					setFloorsTable(plaformAssistantDispatch, { floors });
					setFloorsLoading(false);
					const floorsFiltered = filterFloors(floors);
					setFloorsFiltered(floorsFiltered);
				})
				.catch((error) => {
					console.log(error);
				});
		} else {
			setFloorsLoading(false);
		}
	}, [
		accessToken,
		refreshToken,
		authDispatch,
		plaformAssistantDispatch,
		reloadFloors,
		floorsTable.length
	]);

	useEffect(() => {
		if (orgsOfGroupsManagedTable.length === 0 || reloadOrgsOfGroupsManaged) {
			const urlOrgsManaged = `https://${domainName}/admin_api/organizations/user_groups_managed/`;
			const config = axiosAuth(accessToken);
			axiosInstance(refreshToken, authDispatch)
				.get(urlOrgsManaged, config)
				.then((response) => {
					const orgsOfGroupsManaged = response.data;
					setOrgsOfGroupsManagedTable(plaformAssistantDispatch, { orgsOfGroupsManaged });
					setOrgsOfGroupsManagedLoading(false);
				})
				.catch((error) => {
					console.log(error);
				});
		} else {
			setOrgsOfGroupsManagedLoading(false);
		}
	}, [
		accessToken,
		refreshToken,
		authDispatch,
		plaformAssistantDispatch,
		reloadOrgsOfGroupsManaged,
		orgsOfGroupsManagedTable.length
	]);

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

	useEffect(() => {
		if (digitalTwinsTable.length === 0 || reloadDigitalTwins) {
			const config = axiosAuth(accessToken);
			const urlDigitalTwins = `https://${domainName}/admin_api/digital_twins/user_managed`;
			axiosInstance(refreshToken, authDispatch)
				.get(urlDigitalTwins, config)
				.then((response) => {
					const digitalTwins = response.data;
					setDigitalTwinsTable(plaformAssistantDispatch, { digitalTwins });
					setDigitalTwinsLoading(false);
					const inexistentDashboards = digitalTwins.filter((dt: IDigitalTwin) => dt.dashboardUrl.slice(0, 7) === "Warning");
					if (inexistentDashboards.length !== 0) {
						const warningMessage = "Some dashboards no longer exist"
						toast.warning(warningMessage);
					}
				})
				.catch((error) => {
					const digitalTwins: never[] = [];
					setDigitalTwinsTable(plaformAssistantDispatch, { digitalTwins });
					setDigitalTwinsLoading(false);
					const errorMessage = error.response.data.message;
					toast.error(errorMessage);
					console.log(error);
				});
		} else {
			setDigitalTwinsLoading(false);
		}
	}, [accessToken, refreshToken, authDispatch, plaformAssistantDispatch, reloadDigitalTwins, digitalTwinsTable.length]);

	const clickHandler = (optionToShow: string) => {
		setOptionToShow(optionToShow);
	}

	const geoLocationOrDTOptionTitle = () => {
		let title = "Geolocation"
		if (optionToShow === PLATFORM_ASSISTANT_HOME_OPTIONS.DIGITAL_TWINS) title = "Digital twins";
		return title;
	}


	return (
		<>
			<PlatformAssistantHomeOptionsContainer>
				<OptionContainer
					isOptionActive={
						optionToShow === PLATFORM_ASSISTANT_HOME_OPTIONS.GEOLOCATION ||
						optionToShow === PLATFORM_ASSISTANT_HOME_OPTIONS.DIGITAL_TWINS
					}
					onClick={() => clickHandler(PLATFORM_ASSISTANT_HOME_OPTIONS.GEOLOCATION)}
				>
					{geoLocationOrDTOptionTitle()}
				</OptionContainer>
				<OptionContainer isOptionActive={optionToShow === PLATFORM_ASSISTANT_HOME_OPTIONS.TUTORIAL} onClick={() => clickHandler(PLATFORM_ASSISTANT_HOME_OPTIONS.TUTORIAL)}>
					Tutorial
				</OptionContainer>
			</PlatformAssistantHomeOptionsContainer>
			<ContentContainer >
				<>
					{(buildingsLoading || floorsLoading || orgsOfGroupsManagedLoading || groupsManagedLoading || deviceLoading || digitalTwinLoading) ?
						<Loader />
						:
						<>
							{optionToShow === PLATFORM_ASSISTANT_HOME_OPTIONS.GEOLOCATION &&
								<GeolocationContainer
									buildings={buildingsFiltered}
									floors={floorsFiltered}
									orgsOfGroupsManaged={orgsOfGroupsManagedTable}
									groupsManaged={groupsManagedTable}
									devices={devicesTable}
									digitalTwins={digitalTwinsTable}
									buildingSelected={buildingSelected}
									selectBuilding={selectBuilding}
									floorSelected={floorSelected}
									selectFloor={selectFloor}
									orgSelected={orgSelected}
									selectOrg={selectOrg}
									groupSelected={groupSelected}
									selectGroup={selectGroup}
									deviceSelected={deviceSelected}
									selectDevice={selectDevice}
									digitalTwinSelected={digitalTwinSelected}
									selectDigitalTwin={selectDigitalTwin}
									refreshBuildings={refreshBuildings}
									refreshFloors={refreshFloors}
									refreshOrgsOfGroupsManaged={refreshOrgsOfGroupsManaged}
									refreshGroupsManaged={refreshGroupsManaged}
									refreshDevices={refreshDevices}
									refreshDigitalTwins={refreshDigitalTwins}
									initialOuterBounds={initialOuterBounds}
									outerBounds={outerBounds}
									setNewOuterBounds={setNewOuterBounds}
									resetBuildingSelection={resetBuildingSelection}
									openDigitalTwin3DViewer={openDigitalTwin3DViewer}
								/>
							}
							{(optionToShow === PLATFORM_ASSISTANT_HOME_OPTIONS.DIGITAL_TWINS && digitalTwinGltfData) &&
								<Suspense fallback={null}>
									<DigitalTwin3DViewer
										digitalTwinSelected={digitalTwinSelected}
										digitalTwinGltfData={digitalTwinGltfData}
										close3DViewer={() => setOptionToShow(PLATFORM_ASSISTANT_HOME_OPTIONS.GEOLOCATION)}
									/>
								</Suspense>
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
