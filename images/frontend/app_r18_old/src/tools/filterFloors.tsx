import { IFloor } from "../components/PlatformAssistant/TableColumns/floorsColumns";

export const filterFloors = (floors: IFloor[]) => {
    const condition = (floor: IFloor) => !(floor.geoJsonData === null || Object.keys(floor.geoJsonData).length === 0);
    const floorsFiltered = floors.filter(condition);
    return floorsFiltered;
}