import L from "leaflet";
import marker from "./assets/basic_marker/marker.svg";
import alertingMarker from "./assets/basic_marker/alertingMarker.svg";
import pendingMarker from "./assets/basic_marker/pendingMarker.svg";
import mainOrgMarker from "./assets/main_org_markers/marker_main_org.svg";
import mainOrgAlertingMarker from "./assets/main_org_markers/alerting_marker_main_org.svg";
import mainOrgPendingMarker from "./assets/main_org_markers/pending_marker_main_org.svg";
import genericOrgMarker from "./assets/generic_org_markers/marker_org.svg";
import genericOrgAlertingMarker from "./assets/generic_org_markers/alerting_marker_org.svg";
import genericOrgPendingMarker from "./assets/generic_org_markers/pending_marker_org.svg";
import providerOrgMarker from "./assets/provider_org_markers/marker_provider_org.svg";
import providerOrgAlertingMarker from "./assets/provider_org_markers/alerting_marker_provider_org.svg";
import providerOrgPendingMarker from "./assets/provider_org_markers/pending_marker_provider_org.svg";
import { IOrgOfGroupsManaged } from "../TableColumns/orgsOfGroupsManagedColumns";

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


export const IconMarker = (orgsInBuilding: IOrgOfGroupsManaged[]) => {
    let iconMarker = L.icon({
        iconUrl: marker,
        iconRetinaUrl: marker,
        iconAnchor: [18, 46],
        iconSize: [62.5, 50],
        className: "leaflet-icon"
    });

    let maxOrgRoleInBuilding = getMaxOrgRoleInBuilding(orgsInBuilding);

    switch (maxOrgRoleInBuilding) {
        case 'Main':
            iconMarker = L.icon({
                iconUrl: mainOrgMarker,
                iconRetinaUrl: mainOrgMarker,
                iconAnchor: [18, 46],
                iconSize: [62.5, 50],
                className: "leaflet-icon"
            });
            break;
        case 'Generic':
            iconMarker = L.icon({
                iconUrl: genericOrgMarker,
                iconRetinaUrl: genericOrgMarker,
                iconAnchor: [18, 46],
                iconSize: [62.5, 50],
                className: "leaflet-icon"
            });
            break;
        case 'Provider':
            iconMarker = L.icon({
                iconUrl: providerOrgMarker,
                iconRetinaUrl: providerOrgMarker,
                iconAnchor: [18, 46],
                iconSize: [62.5, 50],
                className: "leaflet-icon"
            });
            break;
    }

    return iconMarker;
}

export const IconAlertingMarker = (orgsInBuilding: IOrgOfGroupsManaged[]) => {
    let iconAlertingMarker = L.icon({
        iconUrl: alertingMarker,
        iconRetinaUrl: alertingMarker,
        iconAnchor: [18, 46],
        iconSize: [62.5, 50],
        className: "leaflet-icon",
    });

    let maxOrgRoleInBuilding = getMaxOrgRoleInBuilding(orgsInBuilding);

    switch (maxOrgRoleInBuilding) {
        case 'Main':
            iconAlertingMarker = L.icon({
                iconUrl: mainOrgAlertingMarker,
                iconRetinaUrl: mainOrgAlertingMarker,
                iconAnchor: [18, 46],
                iconSize: [62.5, 50],
                className: "leaflet-icon"
            });
            break;
        case 'Generic':
            iconAlertingMarker = L.icon({
                iconUrl: genericOrgAlertingMarker,
                iconRetinaUrl: genericOrgAlertingMarker,
                iconAnchor: [18, 46],
                iconSize: [62.5, 50],
                className: "leaflet-icon"
            });
            break;
        case 'Provider':
            iconAlertingMarker = L.icon({
                iconUrl: providerOrgAlertingMarker,
                iconRetinaUrl: providerOrgAlertingMarker,
                iconAnchor: [18, 46],
                iconSize: [62.5, 50],
                className: "leaflet-icon"
            });
            break;
    }

    return iconAlertingMarker;
}


export const IconPendingMarker = (orgsInBuilding: IOrgOfGroupsManaged[]) => {
    let iconPendingMarker = L.icon({
        iconUrl: pendingMarker,
        iconRetinaUrl: pendingMarker,
        iconAnchor: [18, 46],
        iconSize: [62.5, 50],
        className: "leaflet-icon",
    });

    let maxOrgRoleInBuilding = getMaxOrgRoleInBuilding(orgsInBuilding);

    switch (maxOrgRoleInBuilding) {
        case 'Main':
            iconPendingMarker = L.icon({
                iconUrl: mainOrgPendingMarker,
                iconRetinaUrl: mainOrgPendingMarker,
                iconAnchor: [18, 46],
                iconSize: [62.5, 50],
                className: "leaflet-icon"
            });
            break;
        case 'Generic':
            iconPendingMarker = L.icon({
                iconUrl: genericOrgPendingMarker,
                iconRetinaUrl: genericOrgPendingMarker,
                iconAnchor: [18, 46],
                iconSize: [62.5, 50],
                className: "leaflet-icon"
            });
            break;
        case 'Provider':
            iconPendingMarker = L.icon({
                iconUrl: providerOrgPendingMarker,
                iconRetinaUrl: providerOrgPendingMarker,
                iconAnchor: [18, 46],
                iconSize: [62.5, 50],
                className: "leaflet-icon"
            });
            break;
    }

    return iconPendingMarker;
}