export const generateAssetMarker = (assetStatus: string, svgString: string): string => {
    let backgroundColor;
    switch (assetStatus) {
        case "ok":
            backgroundColor = "#2A81CB";
            break;
        case "pending":
            backgroundColor = "#F79520";
            break;
        case "alerting":
            backgroundColor = "#FF4040";
            break;
        default:
            backgroundColor = "#2A81CB";
    }

    const newSvgString = svgString.replace(/#2A81CB/g, backgroundColor).replace(/#2a81cb/g, backgroundColor);
    const assetMarkerUrl = "data:image/svg+xml," + encodeURIComponent(newSvgString);
    return assetMarkerUrl;
}