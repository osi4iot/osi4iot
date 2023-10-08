import { FC, useMemo, useState, useRef } from 'react'
import L, { LeafletMouseEvent, LatLngExpression } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useMap, Circle } from 'react-leaflet';
import styled from "styled-components";
import { LatLngTuple } from 'leaflet';
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
import { StyledTooltip as Tooltip } from './Tooltip';
import calcGeoBounds from '../../../tools/calcGeoBounds';
import { AssetSVGOverlays } from './svg_assets_overlay/AssetSVGOverlays';



const CircleStyledDragging = styled(Circle)`
    &:hover {
        cursor: all-scroll;
    }
`;

const CircleStyledNoDragging = styled(Circle)`
    &:hover {
        cursor: auto;
    }
`;


let DefaultIcon = L.icon({
    iconUrl: icon,
    iconAnchor: [12, 41],
    shadowUrl: iconShadow
});

L.Marker.prototype.options.icon = DefaultIcon;


const SELECTED = "#3274d9";
const ASSET_COLOR = "#e0e0dc";

interface DraggableAssetCircleProps {
    assetName: string;
    assetRadio: number;
    assetType: string;
    assetPosition: LatLngExpression;
    setAssetPosition: (assetPosition: LatLngExpression) => void;
    assetDragging: boolean;
    setAssetDragging: (assetDragging: boolean) => void;
}


const DraggableAssetCircle: FC<DraggableAssetCircleProps> = ({
    assetName,
    assetRadio,
    assetType,
    assetPosition,
    setAssetPosition,
    assetDragging,
    setAssetDragging,
}) => {
    const map = useMap();
    const imageRef = useRef();

    const [bounds, setBounds] = useState(calcGeoBounds((assetPosition as number[])[1], (assetPosition as number[])[0], assetRadio * 0.0004));

    const evenstHandlerCircle = useMemo(
        () => ({
            mousedown() {
                map.dragging.disable();
                setAssetDragging(true);
            },
            mouseup(e: LeafletMouseEvent) {
                map.dragging.enable();
                setAssetDragging(false);
                const bounds = calcGeoBounds(e.latlng.lng, e.latlng.lat, assetRadio * 0.0004)

                setBounds(bounds);
                setAssetPosition([e.latlng.lat, e.latlng.lng])
            },
            mousemove(e: LeafletMouseEvent) {
                if (assetDragging) {
                    if (imageRef.current) {
                        const bounds = calcGeoBounds(e.latlng.lng, e.latlng.lat, assetRadio * 0.0004);
                        (imageRef.current as any).setBounds(bounds);
                        setBounds(bounds);
                    }
                    setAssetPosition([e.latlng.lat, e.latlng.lng])
                }
            },
        }),
        [map, setAssetDragging, assetDragging, setAssetPosition, assetRadio],
    )


    return (
        <>
            {
                assetDragging ?
                    <CircleStyledDragging
                        center={assetPosition}
                        pathOptions={{ color: SELECTED, fillColor: "#555555", fillOpacity: 0.5 }}
                        radius={assetRadio}
                        eventHandlers={evenstHandlerCircle}
                    >
                    </CircleStyledDragging>
                    :
                    <CircleStyledNoDragging
                        center={assetPosition}
                        pathOptions={{ color: SELECTED, fillColor: "#555555", fillOpacity: 0.5 }}
                        radius={assetRadio}
                        eventHandlers={evenstHandlerCircle}
                    >
                        <Tooltip sticky>
                            <span style={{ fontWeight: 'bold' }}>Device</span><br />
                            Name: {assetName}<br />
                        </Tooltip>
                    </CircleStyledNoDragging>
            }
            <AssetSVGOverlays
                assetType={assetType}
                fillColor={ASSET_COLOR}
                bounds={bounds as LatLngTuple[]}
                imageRef={imageRef}
            />
        </>
    )
};


export default DraggableAssetCircle;