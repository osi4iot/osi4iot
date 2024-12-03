import { FC, useMemo } from "react";
import { SVGOverlay } from 'react-leaflet';
import { LatLngTuple } from 'leaflet';
import pointOnFeature from '@turf/point-on-feature';
import {  polygon } from '@turf/helpers';

import calcTextBounds from "../../../tools/calcTextBound";

interface GroupTitleSvgImageProps {
    groupGeoJsonData: any
    groupName: string;
}


export const GroupTitleSvgImage: FC<GroupTitleSvgImageProps> = ({
    groupGeoJsonData,
    groupName
}) => {

    const geoPolygon = polygon(groupGeoJsonData.features[0].geometry.coordinates);
    const center = pointOnFeature(geoPolygon);
    const centerLongitude = center.geometry.coordinates[0];
    const centerLatitude = center.geometry.coordinates[1];

    const bounds = useMemo(() => calcTextBounds(centerLongitude , centerLatitude, 0.002, 0.001), [centerLongitude , centerLatitude]);

    return (
        <>
            <SVGOverlay
                attributes={{ viewBox: "0 0 1500.00 100.00", fill: "#CACFD2" }}
                bounds={bounds as LatLngTuple[]}
            >
                <text x="0.0" y="0.0" id="text5684" font-style="italic" font-size="100px">{groupName.replace(/_/g, " ")}</text>
            </SVGOverlay>
        </>
    )
};