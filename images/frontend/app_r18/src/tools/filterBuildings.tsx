import { IBuilding } from "../components/PlatformAssistant/TableColumns/buildingsColumns";

export const filterBuildings = (buildings: IBuilding[]) => {
    const condition = (building: IBuilding) => !(building.geoJsonData === null || Object.keys(building.geoJsonData).length === 0);
    const buildingsFiltered = buildings.filter(condition);
    return buildingsFiltered;
}