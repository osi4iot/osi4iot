import L from "leaflet";
import { IOrgOfGroupsManaged } from "../TableColumns/orgsOfGroupsManagedColumns";
import { generateOrgMarker } from "../../../tools/generateOrgMarker";

const getMaxOrgRoleInBuilding = (orgsInBuilding: IOrgOfGroupsManaged[]) => {
    let maxOrgRoleInBuilding = 'None';
    const isThereMainOrg = orgsInBuilding.filter(org => org.role === 'Main').length !== 0;
    if (isThereMainOrg) maxOrgRoleInBuilding = 'Main'
    else {
        const isThereGenericOrg = orgsInBuilding.filter(org => org.role === 'Generic').length !== 0;
        if (isThereGenericOrg) maxOrgRoleInBuilding = 'Generic'
        else {
            const isThereProviderOrg = orgsInBuilding.filter(org => org.role === 'Provider').length !== 0;
            if (isThereProviderOrg) maxOrgRoleInBuilding = 'Provider';
        }
    }
    return maxOrgRoleInBuilding;
}

export const BuildingIconMarker = (
    buildingStatus: string,
    orgsInBuilding: IOrgOfGroupsManaged[]
) => {

    let maxOrgRoleInBuilding = getMaxOrgRoleInBuilding(orgsInBuilding);

    const iconMarker = L.icon({
        iconUrl: generateOrgMarker(maxOrgRoleInBuilding, buildingStatus),
        iconRetinaUrl: generateOrgMarker(maxOrgRoleInBuilding, buildingStatus),
        iconAnchor: [25, 50],
        iconSize: [50, 50],
        className: "leaflet-icon"
    });

    return iconMarker;
}