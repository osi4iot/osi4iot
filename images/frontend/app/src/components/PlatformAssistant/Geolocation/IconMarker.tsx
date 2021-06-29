import L from "leaflet";
import marker from "./assets/marker.svg";
import alertingMarker from "./assets/alertingMarker.svg";
import pendingMarker from "./assets/pendingMarker.svg";

export const IconMarker = L.icon({
    iconUrl: marker,
    iconRetinaUrl: marker,
    iconAnchor: [18, 46],
    iconSize: [62.5, 50],
    className: "leaflet-icon",
});

export const IconAlertingMarker = L.icon({
    iconUrl: alertingMarker,
    iconRetinaUrl: alertingMarker,
    iconAnchor: [18, 46],
    iconSize: [62.5, 50],
    className: "leaflet-icon",
});

export const IconPendingMarker = L.icon({
    iconUrl: pendingMarker,
    iconRetinaUrl: pendingMarker,
    iconAnchor: [18, 46],
    iconSize: [62.5, 50],
    className: "leaflet-icon",
});