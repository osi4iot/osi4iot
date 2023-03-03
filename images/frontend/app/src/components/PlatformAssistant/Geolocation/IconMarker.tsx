import L from "leaflet";
import marker from "./assets/basic_marker/marker.svg";
import alertingMarker from "./assets/basic_marker/alertingMarker.svg";
import pendingMarker from "./assets/basic_marker/pendingMarker.svg";

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