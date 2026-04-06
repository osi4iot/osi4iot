import styled from "styled-components";

import { Tooltip } from 'react-leaflet';
import { asStylable } from "../../../tools/styledLeaflet";

const StylableTooltip = asStylable(Tooltip);

export const StyledTooltip = styled(StylableTooltip)`
    &.leaflet-tooltip {
        background: #202226;
        opacity: 1;
        color: white;
        border: 1px solid #202226;
    }

    &.leaflet-tooltip-left::before {
        border-left-color: #202226
    }

    &.leaflet-tooltip-right::before {
        border-right-color: #202226
    }  
`;
