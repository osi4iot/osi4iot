import L from "leaflet";
import { generateAssetMarker } from "../../../tools/generateAssetMarker";

export const AssetIconMarker = (
    assetStatus: string,
    markerSvgString: string
) => {
    const iconMarker = L.icon({
        iconUrl: generateAssetMarker(assetStatus,  markerSvgString),
        iconRetinaUrl: generateAssetMarker(assetStatus,  markerSvgString),
        iconAnchor: [25, 50],
        iconSize: [50, 50],
        className: "leaflet-icon"
    });
    return iconMarker;
}