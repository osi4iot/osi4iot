import { FC, useMemo } from 'react'
import 'leaflet/dist/leaflet.css';
import { Circle } from 'react-leaflet';
import { LatLngTuple } from 'leaflet';
import { StyledTooltip as Tooltip } from './Tooltip';
import calcGeoBounds from '../../../tools/calcGeoBounds';
import { IAsset } from '../TableColumns/assetsColumns';
import { AssetSvgImages } from './AssetSvgImages';


const NORMAL = "#9c9a9a";
const ASSET_COLOR = "#e0e0dc";

interface NonDraggableAssetCircleProps {
    asset: IAsset;
    iconSvgString: string;
}

const NonDraggableAssetCircle: FC<NonDraggableAssetCircleProps> = ({ asset, iconSvgString }) => {
    const assetPosition = [asset.latitude, asset.longitude];

    const outerBounds = useMemo(() => calcGeoBounds(asset.longitude, asset.latitude, asset.iconRadio * 0.001), [asset]);
    const bounds = useMemo(() => calcGeoBounds(asset.longitude, asset.latitude, asset.iconRadio * 0.0004), [asset]);

    return (
        <>
            <Circle
                center={assetPosition as LatLngTuple}
                pathOptions={{ color: NORMAL, fillColor: "#555555", fillOpacity: 0.5 }}
                radius={asset.iconRadio}
            >
                <Tooltip sticky>
                    <span style={{ fontWeight: 'bold' }}>Asset</span><br />
                    Name: {`Asset_${asset.assetUid}`}<br />
                </Tooltip>
            </Circle>
            <AssetSvgImages
                status={"OK"}
                assetId={asset.id}
                iconSvgString={iconSvgString}
                assetSelected={null}
                fillColor={ASSET_COLOR}
                bounds={bounds as LatLngTuple[]}
                outerBounds={outerBounds as LatLngTuple[]}
                imageRef={null}
            />
        </>
    )
};


export default NonDraggableAssetCircle;