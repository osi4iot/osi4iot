import styled from "styled-components";
import { 
    FaShareSquare, 
    FaFolderOpen, 
    FaFolderMinus, 
    FaChartLine, 
    FaCheckCircle,
    FaRegStopCircle,
    FaQuestionCircle
} from "react-icons/fa";
import { MdError } from "react-icons/md";
import { HiShieldCheck, HiShieldExclamation } from "react-icons/hi";
import { RiWifiLine, RiWifiOffLine } from "react-icons/ri";
import { TiFlowMerge } from "react-icons/ti";
import { BsChatDotsFill } from "react-icons/bs";
import { SlidersHorizontal, Logs, Box, RotateCcw, RefreshCw, Download, CircleX, Upload, Play, Camera } from "lucide-react";

// Layout components
export const CanvasContainer = styled.div`
    background-color: #212121;
    height: 100%;
    color: white;
    width: 100%;
    position: relative;
`;

export const HeaderOptionsContainer = styled.div`
    display: flex;
    flex-direction: row;
    justify-content: space-around;
    align-items: center;
`;

// Info containers
// Datos del objeto bajo el ratón (Name, Type, Collection), abajo a la derecha junto al inspector
export const SelectedObjectInfoContainer = styled.div<{ $right?: number }>`
    position: absolute;
    bottom: 12px;
    right: ${({ $right }) => $right ?? 12}px;
    max-width: 600px;
    padding: 8px 6px;
    background-color: rgba(20, 22, 26, 0.88);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 12px;
    color: #e6e8eb;
    z-index: 900;
    pointer-events: none;
`;

export const ObjectInfoContainer = styled.div`
    font-size: 12px;
    padding: 0 6px;
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
`;

export const ObjectInfo = styled.div`
    margin: 0 4px;
    white-space: nowrap;
`;

export const MaxMinValuesContainer = styled.div`
    background-color: #141619;
    margin: 5px 10px;
    border-radius: 10px;
    padding: 5px;
    color: white;
    position: absolute;
    bottom: 12px;
    left: 12px;
    margin: 0;
    width: 18%;
    min-width: 220px;
    z-index: 900;
`;

export const MaxMinFlexContainer = styled.div`
    font-size: 12px;
    padding: 3px 10px;
    display: flex;
    justify-content: space-between;
    flex-wrap: wrap;
`;

export const FemMaxValue = styled.div`
    margin: 0px 10px;
`;

export const FemMinValue = styled.div`
    margin: 0px 10px;
`;

export const NatsConnectionDiv = styled.div`
    background-color: #141619;
    padding: 20px 5px;
    font-size: 12px;
    color: #3274d9;
    height: 20px;
    display: flex;
    justify-content: center;
    align-items: center;
`;

// Icon components
const IconBaseStyles = `
    background-color: #141619;
    font-size: 30px;
    color: #3274d9;
    margin: 10px;

    &:hover {
        color: white;
        cursor: pointer;
    }
`;

export const ExitIcon = styled(FaShareSquare as any)`
    ${IconBaseStyles}
`;

export const DashboardIcon = styled(FaChartLine as any)`
    ${IconBaseStyles}
`;

export const OpenFolderIcon = styled(FaFolderOpen as any)`
    ${IconBaseStyles}
`;

export const CloseFolderIcon = styled(FaFolderMinus as any)`
    ${IconBaseStyles}
`;

export const TiFlowMergeIcon = styled(TiFlowMerge as any)`
    ${IconBaseStyles}
    rotate: -90deg;
`;

export const SlidersHorizontalIcon = styled(SlidersHorizontal as any)`
    ${IconBaseStyles}
`;

export const LogsIcon = styled(Logs as any)`
    ${IconBaseStyles}
`;

export const BoxIcon = styled(Box as any)`
    ${IconBaseStyles}
`;

export const CameraIcon = styled(Camera as any)`
    ${IconBaseStyles}
`;


export const RotateCcwIcon = styled(RotateCcw as any)`
    ${IconBaseStyles}
`;

export const RefreshCwIcon = styled(RefreshCw as any)`
    ${IconBaseStyles}
`;

export const DownloadIcon = styled(Download as any)`
    ${IconBaseStyles}
`;

export const CircleXIcon = styled(CircleX as any)`
    ${IconBaseStyles}
`;

export const UploadIcon = styled(Upload as any)`
    ${IconBaseStyles}
`;

export const PlayIcon = styled(Play as any)`
    ${IconBaseStyles}
`;

export const StoppedIndicator = styled(FaRegStopCircle as any)`
    background-color: #141619;
    font-size: 25px;
    color: #ff4040;
    margin: 10px;

    &:hover {
        color: white;
    }
`;

export const ErrorIndicator = styled(MdError as any)`
    background-color: #141619;
    font-size: 25px;
    color: #ff4040;
    margin: 10px;

    &:hover {
        color: white;
    }
`;

export const RunningIndicator = styled(FaCheckCircle as any)`
    background-color: #141619;
    font-size: 25px;
    color: #62f700;
    margin: 10px;

    &:hover {
        color: white;
    }
`;

export const IndicatorContainer = styled.div`
    position: relative;
    display: inline-block;
    margin-right: 6px;
`;


export const InstanceBadge = styled.div`
    position: absolute;
    bottom: 8px;
    right: -6px;
    background-color: #2196F3;
    color: white;
    border-radius: 50%;
    width: 18px;
    height: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    font-weight: bold;
    border: 2px solid #141619;
    box-sizing: border-box;
`;

export const UnknownIndicator = styled(FaQuestionCircle as any)`
    background-color: #141619;
    font-size: 25px;
    color: #806787;
    margin: 10px;

    &:hover {
        color: white;
    }
`;


export const ChatAssistantIcon = styled(BsChatDotsFill as any)`
    background-color: #141619;
    font-size: 28px;
    color: #3274d9;
    margin: 10px;

    &:hover {
        color: white;
        cursor: pointer;
    }
`;

export const HiShieldCheckIcon = styled(HiShieldCheck as any)`
    background-color: #141619;
    font-size: 30px;
    color: #62f700;
    margin: 10px;

    &:hover {
        color: white;
        cursor: pointer;
    }
`;

export const HiShieldExclamationIcon = styled(HiShieldExclamation as any)`
    background-color: #141619;
    font-size: 30px;
    color: #ff4040;
    margin: 10px;
    animation: blinker 0.8s step-start infinite;

    @keyframes blinker {
        50% {
            opacity: 0;
        }
    }

    &:hover {
        color: white;
        cursor: pointer;
    }
`;

export const NatsText = styled.span`
    color: #3274d9;
    font-weight: bold;
    margin-right: 2px;
    font-size: 14px;
`;

export const WifiIcon = styled(RiWifiLine as any)`
    background-color: #141619;
    font-size: 30px;
    color: #3274d9;
    margin: 10px 3px;
    transform: rotate(90deg);
`;

export const NoWifiIcon = styled(RiWifiOffLine as any)`
    background-color: #141619;
    font-size: 30px;
    color: #3274d9;
    margin: 10px 5px;
    transform: rotate(90deg);
`;
