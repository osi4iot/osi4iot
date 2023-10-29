import { FC, useEffect, useRef, useState } from "react";
import { GeoJSON } from 'react-leaflet';
import { IFeatureCollection } from "../../../tools/spacesDivider";


const STATUS_HOVER = "#9c9a9a";
const STATUS_NORMAL = "#3e3f3b";
const STATUS_SELECTED = "#3274d9";
const NORMAL = "#9c9a9a";

const setFloorSpaceStyle = (status: string) => {
    if (status === "Hover") {
        return {
            stroke: true,
            color: STATUS_HOVER,
            weight: 3,
            opacity: 1,
            fill: true,
            fillColor: "#3e3f3b",
            fillOpacity: 0.2
        }
    } else if (status === "Selected") {
        return {
            stroke: true,
            color: STATUS_SELECTED,
            weight: 3,
            opacity: 1,
            fill: true,
            fillColor: "#3e3f3b",
            fillOpacity: 0.2
        }
    } else  {
        return {
            stroke: true,
            color: NORMAL,
            weight: 1.5,
            opacity: 0.5,
            fill: true,
            fillColor: STATUS_NORMAL,
            fillOpacity: 0.2
        }
    }

}

interface GeoFloorSpaceProps {
    spaceGeodata: IFeatureCollection;
    spaceSelected: IFeatureCollection | null;
    setSpaceSelected: (spacesSelected: IFeatureCollection) => void;
}

const GeoFloorSpace: FC<GeoFloorSpaceProps> = ({ spaceGeodata, spaceSelected, setSpaceSelected }) => {
    const [status, setStatus] = useState("Normal");
    const floorSpaceRef = useRef(null);

    useEffect(() => {
        if (spaceSelected) {
            if (spaceGeodata.features[0]?.properties?.index === spaceSelected.features[0]?.properties?.index) {
                setStatus("Selected");
            } else {
                setStatus("Normal");
            }
        }
    }, [spaceGeodata, spaceSelected]);


    useEffect(() => {
        const currenFloorSpaceRef = floorSpaceRef.current;
        if (currenFloorSpaceRef) {
            (currenFloorSpaceRef as any)
                .setStyle(setFloorSpaceStyle(status));
        }
    }, [status]);

    const clickHandler = () => {
        setSpaceSelected(spaceGeodata);
    }

    const mouseOverHandler = () => {
        if (spaceSelected) {
            if (spaceGeodata.features[0]?.properties?.index === spaceSelected.features[0]?.properties?.index) {
                setStatus("Selected");
            } else {
                setStatus("Hover");
            }
        } else {
            setStatus("Hover");
        }
    }

    const mouseOutHandler  = () => {
        if (spaceSelected) {
            if (spaceGeodata.features[0]?.properties?.index === spaceSelected.features[0]?.properties?.index) {
                setStatus("Selected");
            } else {
                setStatus("Normal");
            }
        } else {
            setStatus("Normal");
        }
    }

    return (
        <GeoJSON
            ref={floorSpaceRef}
            data={spaceGeodata}
            eventHandlers={{ click: clickHandler, mouseover: mouseOverHandler, mouseout: mouseOutHandler }}
        />
    )
}

export default GeoFloorSpace;