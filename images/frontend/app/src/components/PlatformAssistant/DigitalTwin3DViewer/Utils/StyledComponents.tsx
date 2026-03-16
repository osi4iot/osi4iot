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
import DatGui, { 
    DatNumber, 
    DatBoolean, 
    DatSelect, 
    DatButton 
} from "react-dat-gui";
import { ComponentType } from "react";

// Layout components
export const CanvasContainer = styled.div`
    background-color: #212121;
    height: 100%;
    color: white;
    width: 100%;
    position: relative;
`;

export const HeaderContainer = styled.div`
    background-color: #141619;
    width: 550px;
    position: fixed;
    top: 210px;
    right: 15px;
    border-bottom: 3px solid #212121;
`;

export const HeaderOptionsContainer = styled.div`
    display: flex;
    flex-direction: row;
    justify-content: space-around;
    align-items: center;
`;

// Info containers
export const SelectedObjectInfoContainer = styled.div`
    background-color: #141619;
    margin: 5px 10px;
    border-radius: 10px;
    padding: 5px;
    color: white;
    position: fixed;
    bottom: 20px;
    right: 5px;
    width: 550px;
`;

export const ObjectInfoContainer = styled.div`
    font-size: 12px;
    padding: 3px 10px;
    display: flex;
    justify-content: space-between;
    flex-wrap: wrap;
`;

export const ObjectInfo = styled.div`
    margin: 0px 10px;
`;

export const MaxMinValuesContainer = styled.div`
    background-color: #141619;
    margin: 5px 10px;
    border-radius: 10px;
    padding: 5px;
    color: white;
    position: fixed;
    bottom: 12px;
    left: 30;
    width: 18%;
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

export const MqttConnectionDiv = styled.div`
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

export const ExitIcon = styled(FaShareSquare as ComponentType<any>)`
    ${IconBaseStyles}
`;

export const DashboardIcon = styled(FaChartLine as ComponentType<any>)`
    ${IconBaseStyles}
`;

export const OpenFolderIcon = styled(FaFolderOpen as ComponentType<any>)`
    ${IconBaseStyles}
`;

export const CloseFolderIcon = styled(FaFolderMinus as ComponentType<any>)`
    ${IconBaseStyles}
`;

export const TiFlowMergeIcon = styled(TiFlowMerge as ComponentType<any>)`
    ${IconBaseStyles}
    rotate: -90deg;
`;

export const SlidersHorizontalIcon = styled(SlidersHorizontal)`
    ${IconBaseStyles}
`;

export const LogsIcon = styled(Logs)`
    ${IconBaseStyles}
`;

export const BoxIcon = styled(Box)`
    ${IconBaseStyles}
`;

export const CameraIcon = styled(Camera)`
    ${IconBaseStyles}
`;


export const RotateCcwIcon = styled(RotateCcw)`
    ${IconBaseStyles}
`;

export const RefreshCwIcon = styled(RefreshCw)`
    ${IconBaseStyles}
`;

export const DownloadIcon = styled(Download)`
    ${IconBaseStyles}
`;

export const CircleXIcon = styled(CircleX)`
    ${IconBaseStyles}
`;

export const UploadIcon = styled(Upload)`
    ${IconBaseStyles}
`;

export const PlayIcon = styled(Play)`
    ${IconBaseStyles}
`;

export const StoppedIndicator = styled(FaRegStopCircle as ComponentType<any>)`
    background-color: #141619;
    font-size: 25px;
    color: #ff4040;
    margin: 10px;

    &:hover {
        color: white;
    }
`;

export const ErrorIndicator = styled(MdError as ComponentType<any>)`
    background-color: #141619;
    font-size: 25px;
    color: #ff4040;
    margin: 10px;

    &:hover {
        color: white;
    }
`;

export const RunningIndicator = styled(FaCheckCircle as ComponentType<any>)`
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

export const UnknownIndicator = styled(FaQuestionCircle as ComponentType<any>)`
    background-color: #141619;
    font-size: 25px;
    color: #806787;
    margin: 10px;

    &:hover {
        color: white;
    }
`;



export const ChatAssistantIcon = styled(BsChatDotsFill as ComponentType<any>)`
    background-color: #141619;
    font-size: 28px;
    color: #3274d9;
    margin: 10px;

    &:hover {
        color: white;
        cursor: pointer;
    }
`;

export const HiShieldCheckIcon = styled(HiShieldCheck as ComponentType<any>)`
    background-color: #141619;
    font-size: 30px;
    color: #62f700;
    margin: 10px;

    &:hover {
        color: white;
        cursor: pointer;
    }
`;

export const HiShieldExclamationIcon = styled(HiShieldExclamation as ComponentType<any>)`
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

export const MqttText = styled.span`
    color: #3274d9;
    font-weight: bold;
    margin-right: 2px;
    font-size: 14px;
`;

export const WifiIcon = styled(RiWifiLine as ComponentType<any>)`
    background-color: #141619;
    font-size: 30px;
    color: #3274d9;
    margin: 10px 3px;
    transform: rotate(90deg);
`;

export const NoWifiIcon = styled(RiWifiOffLine as ComponentType<any>)`
    background-color: #141619;
    font-size: 30px;
    color: #3274d9;
    margin: 10px 5px;
    transform: rotate(90deg);
`;

// DatGui styled components
export const StyledDataGui = styled(DatGui)`
    &.react-dat-gui li.folder.closed .title {
        background-color: #141619;
    }

    &.react-dat-gui {
        width: 550px;
        top: 10px;
        right: 15px;
        position: fixed;
        z-index: 1000;
        max-height: calc(100vh - 320px);
        background-color: #212121;
        overflow-y: auto;
        
        ::-webkit-scrollbar {
            width: 10px;
        }

        ::-webkit-scrollbar-track {
            background: #202226;
            border-radius: 5px;
        }

        ::-webkit-scrollbar-thumb {
            background: #2c3235;
            border-radius: 5px;
        }

        ::-webkit-scrollbar-thumb:hover {
            background-color: #343840;
        }

        div:first-child {
            margin-top: 0;
        }

        div:last-child {
            margin-bottom: 3px;
        }
    }
`;

const datGuiFieldStyles = `
    border-left: 5px solid #806787;
    background-color: #141619;
`;

export const StyledDatBoolean = styled(DatBoolean)`
    &.cr.boolean {
        ${datGuiFieldStyles}

        label {
            width: 100%;

            .label-text {
                width: 35% !important;
            }

            .checkbox-container {
                width: 65% !important;
            }
        }
    }
`;

export const StyledDatNumber = styled(DatNumber)`
    &.cr.number {
        ${datGuiFieldStyles}

        label {
            width: 100%;

            .label-text {
                width: 34% !important;
            }
        }

        span {
            width: 66% !important;
        }
    }
`;

export const StyledDatNumberDTSimulator = styled(DatNumber)`
    &.cr.number {
        ${datGuiFieldStyles}

        label {
            width: 100%;
            flex-direction: column;
            margin: 5px 0;

            .label-text {
                width: 100% !important;
                margin: 2px;
            }

            span {
                width: 100% !important;

                .slider {
                    border-left: 0;
                }
            }
        }
    }
`;

export const StyledDatSelect = styled(DatSelect)`
    &.cr.select {
        ${datGuiFieldStyles}

        label {
            width: 100%;

            .label-text {
                width: 20% !important;
            }
        }

        select {
            width: 80% !important;
            color: white;
            background-color: #141619;
            border: 2px solid #7d7f80;
            padding: 2px;
            margin-right: 5px;

            &:focus {
                outline: none;
                box-shadow: rgb(20 22 25) 0px 0px 0px 2px, rgb(31 96 196) 0px 0px 0px 4px;
            }

            &:hover {
                cursor: pointer;
                background-color: #0c0d0f;
            }
        }

        option {
            background-color: #35383d;
        }
    }
`;

export const StyledDatButtom = styled(DatButton)`
    &.cr.button {
        border: 5px solid #141619;
        border-radius: 10px;
        background-color: #3274d9;

        &:hover {
            background: #2461c0;
        }

        .label-text {
            width: 90% !important;
            margin: auto;
            text-align: center;
        }
    }
`;