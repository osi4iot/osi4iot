import { FC, useEffect, useState, useCallback, Suspense, useMemo } from 'react'
import styled from "styled-components";
import { axiosAuth, getDomainName, getProtocol } from '../../../tools/tools';
import { useAuthState, useAuthDispatch } from '../../../contexts/authContext';
import Loader from "../../Tools/Loader";
import { PLATFORM_ASSISTANT_HOME_OPTIONS } from '../Utils/platformAssistantOptions';
import {
	usePlatformAssitantDispatch,
	useGroupsManagedTable,
	setGroupsManagedTable,
	useOrgsOfGroupsManagedTable,
	setOrgsOfGroupsManagedTable,
	useDigitalTwinsTable,
	setDigitalTwinsTable,
	useBuildingsTable,
	useFloorsTable,
	setBuildingsTable,
	setFloorsTable,
	useReloadGroupsManagedTable,
	setReloadGroupsManagedTable,
	useReloadBuildingsTable,
	useReloadFloorsTable,
	setReloadBuildingsTable,
	setReloadFloorsTable,
	useReloadOrgsOfGroupsManagedTable,
	setReloadOrgsOfGroupsManagedTable,
	setReloadAssetsTable,
	setReloadSensorsTable,
	setAssetsTable,
	setSensorsTable,
	setAssetTypesTable,
	setReloadAssetTypesTable,
	setSensorTypesTable,
	setReloadSensorTypesTable,
} from '../../../contexts/platformAssistantContext';
import Tutorial from './Tutorial';
import GeolocationContainer, { IDigitalTwinState, ISensorState } from '../Geolocation/GeolocationContainer';
import { IGroupManaged } from '../TableColumns/groupsManagedColumns';
import { IDigitalTwin } from '../TableColumns/digitalTwinsColumns';
import { IBuilding } from '../TableColumns/buildingsColumns';
import { IFloor } from '../TableColumns/floorsColumns';
import { filterBuildings } from '../../../tools/filterBuildings';
import { filterFloors } from '../../../tools/filterFloors';
import { IOrgOfGroupsManaged } from '../TableColumns/orgsOfGroupsManagedColumns';
import DigitalTwin3DViewer from '../DigitalTwin3DViewer/DigitalTwin3DViewer';
import { toast } from 'react-toastify';
import { IDigitalTwinGltfData } from '../DigitalTwin3DViewer/ViewerUtils';
import SceneLoader from '../../Tools/SceneLoader';
import { useHistory } from 'react-router-dom';
import { getAxiosInstance } from '../../../tools/axiosIntance';
import axiosErrorHandler from '../../../tools/axiosErrorHandler';
import {
	useAssetTypesTable,
	useAssetsTable,
	useReloadAssetTypesTable,
	useReloadAssetsTable,
	useReloadSensorTypesTable,
	useReloadSensorsTable,
	useSensorTypesTable,
	useSensorsTable
} from '../../../contexts/platformAssistantContext/platformAssistantContext';
import { IAsset } from '../TableColumns/assetsColumns';
import { ISensor } from '../TableColumns/sensorsColumns';
import elaspsedTimeFormat from '../../../tools/elapsedTimeFormat';
import { IAssetType } from '../TableColumns/assetTypesColumns';
import { ISensorType } from '../TableColumns/sensorTypesColumns';
import fetchFemResFileCode from '../../../webWorkers/fetchFemResFileCode';
import fetchGltfFileCode from '../../../webWorkers/fetchGltfFileCode';
import { getDTStorageInfo, syncDigitalTwinsLocalStorage } from '../../../tools/fileSystem';

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
    height: calc(100vh - 220px);
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

const findAssetsWithMarker = (
	assetTypes: IAssetType[],
	assets: IAsset[],
	buildings: IBuilding[],
	orgsOfGroupsManagedTable: IOrgOfGroupsManaged[]
) => {
	const assetTypesWithMarker = assetTypes.filter(item =>
		item.geolocationMode === "dynamic" && item.markerSvgString !== ""
	);
	const assetTypesIdArray = assetTypesWithMarker.map(item => item.id);
	const assetsWithMarker = assets.filter(asset => assetTypesIdArray.includes(asset.assetTypeId));
	const assetsWithMarkerFiltered = assetsWithMarker.filter(asset => {
		const assetOrg = orgsOfGroupsManagedTable.filter(org => org.id === asset.orgId)[0];
		const assetBuilding = buildings.filter(building => building.id === assetOrg.buildingId)[0];
		const assetBuildingOuterBounds = assetBuilding.outerBounds;
		if (
			asset.latitude < assetBuildingOuterBounds[0][0] ||
			asset.latitude > assetBuildingOuterBounds[1][0] ||
			asset.longitude < assetBuildingOuterBounds[0][1] ||
			asset.longitude > assetBuildingOuterBounds[1][1]
		) return true
		else return false;
	});
	return assetsWithMarkerFiltered;
}


const findBounds = (
	buildings: IBuilding[],
	assetsWithMarker: IAsset[]
) => {
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
		})

		if (assetsWithMarker.length !== 0) {
			assetsWithMarker.forEach(asset => {
				if (asset.longitude > maxLongitude) maxLongitude = asset.longitude;
				if (asset.longitude < minLongitude) minLongitude = asset.longitude;
				if (asset.latitude > maxLatitude) maxLatitude = asset.latitude;
				if (asset.latitude < minLatitude) minLatitude = asset.latitude;
			})
		}
		outerBounds = [[minLatitude, minLongitude], [maxLatitude, maxLongitude]];
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
const protocol = getProtocol();

const PlatformAssistantHomeOptions: FC<{}> = () => {
	const history = useHistory();
	const { accessToken, refreshToken } = useAuthState();
	const authDispatch = useAuthDispatch();
	const plaformAssistantDispatch = usePlatformAssitantDispatch();
	const buildingsTable = useBuildingsTable();
	const floorsTable = useFloorsTable();
	const orgsOfGroupsManagedTable = useOrgsOfGroupsManagedTable();
	const groupsManagedTable = useGroupsManagedTable();
	const assetTypesTable = useAssetTypesTable();
	const assetsTable = useAssetsTable();
	const sensorTypesTable = useSensorTypesTable();
	const sensorsTable = useSensorsTable();
	const digitalTwinsTable = useDigitalTwinsTable();
	const [buildingsLoading, setBuildingsLoading] = useState(true);
	const [floorsLoading, setFloorsLoading] = useState(true);
	const [orgsOfGroupsManagedLoading, setOrgsOfGroupsManagedLoading] = useState(true);
	const [groupsManagedLoading, setGroupsManagedLoading] = useState(true);
	const [assetTypesLoading, setAssetTypesLoading] = useState(true);
	const [assetsLoading, setAssetsLoading] = useState(true);
	const [sensorTypesLoading, setSensorTypesLoading] = useState(true);
	const [sensorsLoading, setSensorsLoading] = useState(true);
	const [digitalTwinLoading, setDigitalTwinsLoading] = useState(true);
	const [digitalTwinGltfData, setDigitalTwinGltfData] = useState<IDigitalTwinGltfData | null>(null);
	const [optionToShow, setOptionToShow] = useState(PLATFORM_ASSISTANT_HOME_OPTIONS.GEOLOCATION);;
	const reloadBuildingsTable = useReloadBuildingsTable();
	const reloadFloorsTable = useReloadFloorsTable();
	const reloadOrgsOfGroupsManagedTable = useReloadOrgsOfGroupsManagedTable();
	const reloadGroupsManagedTable = useReloadGroupsManagedTable();
	const reloadAssetTypesTable = useReloadAssetTypesTable();
	const reloadAssetsTable = useReloadAssetsTable();
	const reloadSensorsTable = useReloadSensorsTable();
	const reloadSensorTypesTable = useReloadSensorTypesTable();
	const [reloadDigitalTwins, setReloadDigitalTwins] = useState(false);
	const [initialOuterBounds, setInitialOuterBounds] = useState([[0, 0], [0, 0]]);
	const [outerBounds, setOuterBounds] = useState([[0, 0], [0, 0]]);
	const [buildingsFiltered, setBuildingsFiltered] = useState<IBuilding[]>([]);
	const [floorsFiltered, setFloorsFiltered] = useState<IFloor[]>([]);
	const [buildingSelected, setBuildingSelected] = useState<IBuilding | null>(null);
	const [floorSelected, setFloorSelected] = useState<IFloor | null>(null);
	const [orgSelected, setOrgSelected] = useState<IOrgOfGroupsManaged | null>(null);
	const [groupSelected, setGroupSelected] = useState<IGroupManaged | null>(null);
	const [assetSelected, setAssetSelected] = useState<IAsset | null>(null);
	const [sensorSelected, setSensorSelected] = useState<ISensor | null>(null);
	const [digitalTwinSelected, setDigitalTwinSelected] = useState<IDigitalTwin | null>(null);
	const [glftDataLoading, setGlftDataLoading] = useState(false);
	const [digitalTwinsState, setDigitalTwinsState] = useState<IDigitalTwinState[]>([]);
	const [sensorsState, setSensorsState] = useState<ISensorState[]>([]);
	const [assetsWithMarker, setAssetsWithMarker] = useState<IAsset[]>([]);
	const [assetMarkerSelected, setAssetMarkerSelected] = useState(false);
	const fetchFemResFileWorker: Worker = useMemo(
		() => new Worker(fetchFemResFileCode),
		[]
	);

	const fetchGltfFileWorker: Worker = useMemo(
		() => new Worker(fetchGltfFileCode),
		[]
	);

	const refreshBuildings = useCallback(() => {
		setBuildingsLoading(true);
		const reloadBuildingsTable = true;
		setReloadBuildingsTable(plaformAssistantDispatch, { reloadBuildingsTable });
	}, [plaformAssistantDispatch])

	const refreshFloors = useCallback(() => {
		setFloorsLoading(true);
		const reloadFloorsTable = true;
		setReloadFloorsTable(plaformAssistantDispatch, { reloadFloorsTable });
	}, [plaformAssistantDispatch])

	const refreshOrgsOfGroupsManaged = useCallback(() => {
		;
		setOrgsOfGroupsManagedLoading(true);
		const reloadOrgsOfGroupsManagedTable = true;
		setReloadOrgsOfGroupsManagedTable(plaformAssistantDispatch, { reloadOrgsOfGroupsManagedTable });
	}, [plaformAssistantDispatch])

	const refreshGroupsManaged = useCallback(() => {
		setGroupsManagedLoading(true);
		const reloadGroupsManagedTable = true;
		setReloadGroupsManagedTable(plaformAssistantDispatch, { reloadGroupsManagedTable });
	}, [plaformAssistantDispatch]);

	const refreshAssetTypes = useCallback(() => {
		setAssetTypesLoading(true);
		const reloadAssetTypesTable = true;
		setReloadAssetTypesTable(plaformAssistantDispatch, { reloadAssetTypesTable });
	}, [plaformAssistantDispatch])

	const refreshAssets = useCallback(() => {
		setAssetsLoading(true);
		const reloadAssetsTable = true;
		setReloadAssetsTable(plaformAssistantDispatch, { reloadAssetsTable });
	}, [plaformAssistantDispatch])

	const refreshSensors = useCallback(() => {
		setSensorsLoading(true);
		const reloadSensorsTable = true;
		setReloadSensorsTable(plaformAssistantDispatch, { reloadSensorsTable });
	}, [plaformAssistantDispatch])

	const refreshDigitalTwins = useCallback(() => {
		setReloadDigitalTwins(true);
		setDigitalTwinsLoading(true);
		setTimeout(() => setReloadDigitalTwins(false), 500);
	}, [])

	const openDigitalTwin3DViewer = useCallback((
		digitalTwinGltfData: IDigitalTwinGltfData,
		isGroupDTDemo: boolean
	) => {
		if (typeof digitalTwinGltfData.gltfData === 'string') {
			digitalTwinGltfData.gltfData = JSON.parse(digitalTwinGltfData.gltfData);
		}
		digitalTwinGltfData.isGroupDTDemo = isGroupDTDemo;
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
		setAssetSelected(null);
	}

	const selectGroup = (group: IGroupManaged) => {
		setGroupSelected(group);
		setAssetSelected(null);
	}

	const selectAssetMarker = (select: boolean) => {
		setAssetMarkerSelected(select);
	}

	const selectAsset = (asset: IAsset | null) => {
		setAssetSelected(asset);
	}

	const selectSensor = (sensor: ISensor | null) => {
		setSensorSelected(sensor);
	}

	const selectDigitalTwin = (digitalTwin: IDigitalTwin | null) => {
		setDigitalTwinSelected(digitalTwin);
	}

	const resetBuildingSelection = () => {
		setBuildingSelected(null);
		setFloorSelected(null);
		setOrgSelected(null);;
		setGroupSelected(null);
		selectAssetMarker(false);
	}

	const handleCloseViewer = () => {
		selectAsset(null);
		setOptionToShow(PLATFORM_ASSISTANT_HOME_OPTIONS.GEOLOCATION);
	}


	useEffect(() => {
		if (
			buildingsTable.length !== 0 &&
			orgsOfGroupsManagedTable.length !== 0 &&
			assetTypesTable.length !== 0 &&
			assetsTable.length !== 0
		) {
			const buildingsFiltered = filterBuildings(buildingsTable);
			setBuildingsFiltered(buildingsFiltered);
			const assetsWithMarker = findAssetsWithMarker(assetTypesTable, assetsTable, buildingsTable, orgsOfGroupsManagedTable);
			setAssetsWithMarker(assetsWithMarker);
			const outerBounds = findBounds(buildingsFiltered, assetsWithMarker);
			setOuterBounds(outerBounds);
			setInitialOuterBounds(outerBounds);
		}
	}, [buildingsTable, orgsOfGroupsManagedTable, assetTypesTable, assetsTable]);

	useEffect(() => {
		if (floorsTable.length !== 0) {
			const floorsFiltered = filterFloors(floorsTable);
			setFloorsFiltered(floorsFiltered);
		}
	}, [floorsTable]);


	useEffect(() => {
		if (buildingsTable.length === 0 || reloadBuildingsTable) {
			const urlBuildings = `${protocol}://${domainName}/admin_api/buildings/user_groups_managed/`;
			const config = axiosAuth(accessToken);
			getAxiosInstance(refreshToken, authDispatch)
				.get(urlBuildings, config)
				.then((response) => {
					const buildings = response.data;
					buildings.map((building: IBuilding) => {
						building.createdAtAge = elaspsedTimeFormat(building.createdAtAge);
						building.updatedAtAge = elaspsedTimeFormat(building.updatedAtAge);
						return building;
					})
					setBuildingsTable(plaformAssistantDispatch, { buildings });
					setBuildingsLoading(false);
					const buildingsFiltered = filterBuildings(buildings);
					setBuildingsFiltered(buildingsFiltered);
					const outerBounds = findBounds(buildingsFiltered, []);
					setOuterBounds(outerBounds);
					setInitialOuterBounds(outerBounds);
					const reloadBuildingsTable = false;
					setReloadBuildingsTable(plaformAssistantDispatch, { reloadBuildingsTable });
				})
				.catch((error) => {
					axiosErrorHandler(error, authDispatch);
				});
		} else {
			setBuildingsLoading(false);
		}
	}, [
		refreshToken,
		accessToken,
		authDispatch,
		history,
		plaformAssistantDispatch,
		reloadBuildingsTable,
		buildingsTable.length
	]);

	useEffect(() => {
		if (floorsTable.length === 0 || reloadFloorsTable) {
			const urlFloors = `${protocol}://${domainName}/admin_api/building_floors/user_groups_managed/`;
			const config = axiosAuth(accessToken);
			getAxiosInstance(refreshToken, authDispatch)
				.get(urlFloors, config)
				.then((response) => {
					const floors = response.data;
					floors.map((floor: IFloor) => {
						floor.createdAtAge = elaspsedTimeFormat(floor.createdAtAge);
						floor.updatedAtAge = elaspsedTimeFormat(floor.updatedAtAge);
						return floor;
					})
					setFloorsTable(plaformAssistantDispatch, { floors });
					setFloorsLoading(false);
					const floorsFiltered = filterFloors(floors);
					setFloorsFiltered(floorsFiltered);
					const reloadFloorsTable = false;
					setReloadFloorsTable(plaformAssistantDispatch, { reloadFloorsTable });
				})
				.catch((error) => {
					axiosErrorHandler(error, authDispatch);
				});
		} else {
			setFloorsLoading(false);
		}
	}, [
		refreshToken,
		accessToken,
		authDispatch,
		plaformAssistantDispatch,
		reloadFloorsTable,
		floorsTable.length
	]);

	useEffect(() => {
		if (orgsOfGroupsManagedTable.length === 0 || reloadOrgsOfGroupsManagedTable) {
			const urlOrgsManaged = `${protocol}://${domainName}/admin_api/organizations/user_groups_managed/`;
			const config = axiosAuth(accessToken);
			getAxiosInstance(refreshToken, authDispatch)
				.get(urlOrgsManaged, config)
				.then((response) => {
					const orgsOfGroupsManaged = response.data;
					setOrgsOfGroupsManagedTable(plaformAssistantDispatch, { orgsOfGroupsManaged });
					setOrgsOfGroupsManagedLoading(false);
					const reloadOrgsOfGroupsManagedTable = false;
					setReloadOrgsOfGroupsManagedTable(plaformAssistantDispatch, { reloadOrgsOfGroupsManagedTable });
				})
				.catch((error) => {
					axiosErrorHandler(error, authDispatch);
				});
		} else {
			setOrgsOfGroupsManagedLoading(false);
		}
	}, [
		refreshToken,
		accessToken,
		authDispatch,
		plaformAssistantDispatch,
		reloadOrgsOfGroupsManagedTable,
		orgsOfGroupsManagedTable.length
	]);

	useEffect(() => {
		if (groupsManagedTable.length === 0 || reloadGroupsManagedTable) {
			const config = axiosAuth(accessToken);
			const urlGroupsManaged = `${protocol}://${domainName}/admin_api/groups/user_managed`;
			getAxiosInstance(refreshToken, authDispatch)
				.get(urlGroupsManaged, config)
				.then((response) => {
					const groupsManaged = response.data;
					groupsManaged.map((group: { isOrgDefaultGroup: string; }) => {
						group.isOrgDefaultGroup = group.isOrgDefaultGroup ? "Default" : "Generic";
						return group;
					})
					setGroupsManagedTable(plaformAssistantDispatch, { groupsManaged });
					setGroupsManagedLoading(false);
					const reloadGroupsManagedTable = false;
					setReloadGroupsManagedTable(plaformAssistantDispatch, { reloadGroupsManagedTable })
				})
				.catch((error) => {
					axiosErrorHandler(error, authDispatch);
				});
		} else {
			setGroupsManagedLoading(false);
		}
	}, [
		refreshToken,
		accessToken,
		authDispatch,
		plaformAssistantDispatch,
		groupsManagedTable.length,
		reloadGroupsManagedTable
	]);


	useEffect(() => {
		if (assetTypesTable.length === 0 || reloadAssetTypesTable) {
			const config = axiosAuth(accessToken);
			const urlAssetTypes = `${protocol}://${domainName}/admin_api/asset_types/user_managed`;
			getAxiosInstance(refreshToken, authDispatch)
				.get(urlAssetTypes, config)
				.then((response) => {
					const assetTypes = response.data;
					assetTypes.map((assetType: IAssetType) => {
						assetType.isPredefinedString = "No";
						if (assetType.isPredefined) assetType.isPredefinedString = "Yes";
						return assetType;
					})
					setAssetTypesTable(plaformAssistantDispatch, { assetTypes });
					setAssetTypesLoading(false);
					const reloadAssetTypesTable = false;
					setReloadAssetTypesTable(plaformAssistantDispatch, { reloadAssetTypesTable });
				})
				.catch((error) => {
					axiosErrorHandler(error, authDispatch);
				});
		} else {
			setAssetTypesLoading(false);
		}
	}, [
		accessToken,
		refreshToken,
		authDispatch,
		plaformAssistantDispatch,
		reloadAssetTypesTable,
		assetTypesTable.length
	]);

	useEffect(() => {
		if (assetsTable.length === 0 || reloadAssetsTable) {
			const config = axiosAuth(accessToken);
			const urlAssets = `${protocol}://${domainName}/admin_api/assets/user_managed`;
			getAxiosInstance(refreshToken, authDispatch)
				.get(urlAssets, config)
				.then((response) => {
					const assets = response.data;
					setAssetsTable(plaformAssistantDispatch, { assets });
					setAssetsLoading(false);
					const reloadAssetsTable = false;
					setReloadAssetsTable(plaformAssistantDispatch, { reloadAssetsTable });
				})
				.catch((error) => {
					axiosErrorHandler(error, authDispatch);
				});
		} else {
			setAssetsLoading(false);
		}
	}, [
		refreshToken,
		accessToken,
		authDispatch,
		plaformAssistantDispatch,
		assetsTable.length,
		reloadAssetsTable
	]);

	useEffect(() => {
		if (sensorTypesTable.length === 0 || reloadSensorTypesTable) {
			const config = axiosAuth(accessToken);
			const urlSensorTypes = `${protocol}://${domainName}/admin_api/sensor_types/user_managed`;
			getAxiosInstance(refreshToken, authDispatch)
				.get(urlSensorTypes, config)
				.then((response) => {
					const sensorTypes = response.data;
					sensorTypes.map((sensorType: ISensorType) => {
						sensorType.isPredefinedString = "No";
						if (sensorType.isPredefined) sensorType.isPredefinedString = "Yes";
						return sensorType;
					})
					setSensorTypesTable(plaformAssistantDispatch, { sensorTypes });
					setSensorTypesLoading(false);
					const reloadSensorTypesTable = false;
					setReloadSensorTypesTable(plaformAssistantDispatch, { reloadSensorTypesTable });
				})
				.catch((error) => {
					axiosErrorHandler(error, authDispatch);
				});
		} else {
			setSensorTypesLoading(false);
		}
	}, [
		refreshToken,
		accessToken,
		authDispatch,
		plaformAssistantDispatch,
		sensorTypesTable.length,
		reloadSensorTypesTable
	]);

	useEffect(() => {
		if (sensorsTable.length === 0 || reloadSensorsTable) {
			const config = axiosAuth(accessToken);
			const urlSensors = `${protocol}://${domainName}/admin_api/sensors/user_managed`;
			getAxiosInstance(refreshToken, authDispatch)
				.get(urlSensors, config)
				.then((response) => {
					const sensors = response.data;
					setSensorsTable(plaformAssistantDispatch, { sensors });
					setSensorsLoading(false);
					const reloadSensorsTable = false;
					setReloadSensorsTable(plaformAssistantDispatch, { reloadSensorsTable });
				})
				.catch((error) => {
					axiosErrorHandler(error, authDispatch);
				});
		} else {
			setSensorsLoading(false);
		}
	}, [
		refreshToken,
		accessToken,
		authDispatch,
		plaformAssistantDispatch,
		sensorsTable.length,
		reloadSensorsTable
	]);

	useEffect(() => {
		if (digitalTwinsTable.length === 0 || reloadDigitalTwins) {
			setDigitalTwinsLoading(false);
			const config = axiosAuth(accessToken);
			const urlDigitalTwins = `${protocol}://${domainName}/admin_api/digital_twins/user_managed`;
			getAxiosInstance(refreshToken, authDispatch)
				.get(urlDigitalTwins, config)
				.then(async (response) => {
					const digitalTwins = response.data as IDigitalTwin[];
					digitalTwins.forEach(dt => {
						dt.digitalTwinRef = `DT_${dt.digitalTwinUid}`;
						dt.numGltfFilesLocallyStored = 0;
						dt.numFemResFilesLocallyStored = 0;
					});
					setDigitalTwinsLoading(false);
					syncDigitalTwinsLocalStorage(digitalTwins).then(async () => {
						const dtStorageInfo = await getDTStorageInfo();
						const digitalTwinUidArray = dtStorageInfo.map(dt => dt.digitalTwinUid);
						digitalTwins.forEach(dt => {
							const dtIndex = digitalTwinUidArray.indexOf(dt.digitalTwinUid);
							if (dtIndex !== -1) {
								dt.numGltfFilesLocallyStored = dtStorageInfo[dtIndex].numGltfFiles;
								dt.numFemResFilesLocallyStored = dtStorageInfo[dtIndex].numFemResFiles;
							}
						});
						setDigitalTwinsTable(plaformAssistantDispatch, { digitalTwins });
						const inexistentDashboards = digitalTwins.filter((dt: IDigitalTwin) => dt.dashboardUrl.slice(0, 7) === "Warning");
						if (inexistentDashboards.length !== 0) {
							const warningMessage = "Some dashboards no longer exist"
							toast.warning(warningMessage);
						}
					});
				})
				.catch((error) => {
					const digitalTwins: never[] = [];
					setDigitalTwinsTable(plaformAssistantDispatch, { digitalTwins });
					setDigitalTwinsLoading(false);
					axiosErrorHandler(error, authDispatch);
				});
		} else {
			setDigitalTwinsLoading(false);
		}
	}, [
		refreshToken,
		accessToken,
		authDispatch,
		plaformAssistantDispatch,
		reloadDigitalTwins,
		digitalTwinsTable.length
	]);

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
					{(
						buildingsLoading ||
						floorsLoading ||
						orgsOfGroupsManagedLoading ||
						groupsManagedLoading ||
						assetTypesLoading ||
						sensorTypesLoading ||
						assetsLoading ||
						sensorsLoading ||
						digitalTwinLoading ||
						glftDataLoading
					) ?
						<Loader />
						:
						<>
							{optionToShow === PLATFORM_ASSISTANT_HOME_OPTIONS.GEOLOCATION &&
								<GeolocationContainer
									buildings={buildingsFiltered}
									floors={floorsFiltered}
									orgsOfGroupsManaged={orgsOfGroupsManagedTable}
									groupsManaged={groupsManagedTable}
									assetTypes={assetTypesTable}
									assets={assetsTable}
									assetsWithMarker={assetsWithMarker}
									sensorTypes={sensorTypesTable}
									sensors={sensorsTable}
									digitalTwins={digitalTwinsTable}
									buildingSelected={buildingSelected}
									selectBuilding={selectBuilding}
									floorSelected={floorSelected}
									selectFloor={selectFloor}
									orgSelected={orgSelected}
									selectOrg={selectOrg}
									groupSelected={groupSelected}
									selectGroup={selectGroup}
									assetSelected={assetSelected}
									assetMarkerSelected={assetMarkerSelected}
									selectAsset={selectAsset}
									selectAssetMarker={selectAssetMarker}
									sensorSelected={sensorSelected}
									selectSensor={selectSensor}
									digitalTwinSelected={digitalTwinSelected}
									selectDigitalTwin={selectDigitalTwin}
									refreshBuildings={refreshBuildings}
									refreshFloors={refreshFloors}
									refreshOrgsOfGroupsManaged={refreshOrgsOfGroupsManaged}
									refreshGroupsManaged={refreshGroupsManaged}
									refreshAssetTypes={refreshAssetTypes}
									refreshAssets={refreshAssets}
									refreshSensors={refreshSensors}
									refreshDigitalTwins={refreshDigitalTwins}
									initialOuterBounds={initialOuterBounds}
									outerBounds={outerBounds}
									setNewOuterBounds={setNewOuterBounds}
									resetBuildingSelection={resetBuildingSelection}
									openDigitalTwin3DViewer={openDigitalTwin3DViewer}
									setGlftDataLoading={(glftDataLoading) => setGlftDataLoading(glftDataLoading)}
									digitalTwinsState={digitalTwinsState}
									setDigitalTwinsState={setDigitalTwinsState}
									sensorsState={sensorsState}
									setSensorsState={setSensorsState}
									fetchGltfFileWorker={fetchGltfFileWorker}
								/>
							}
							{(optionToShow === PLATFORM_ASSISTANT_HOME_OPTIONS.DIGITAL_TWINS && digitalTwinGltfData) &&
								<Suspense fallback={<SceneLoader />}>
									<DigitalTwin3DViewer
										digitalTwinSelected={digitalTwinSelected}
										digitalTwinGltfData={digitalTwinGltfData}
										close3DViewer={handleCloseViewer}
										fetchFemResFileWorker={fetchFemResFileWorker}
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
