import { FC, useState, useEffect, useRef, SetStateAction, Dispatch } from "react";
import { NatsConnection } from "nats.ws";
import { ChildrenProp } from "../interfaces/interfaces";
import { axiosAuth, getDomainName, getProtocol } from "../tools/tools";
import Header from "../components/Layout/Header";
import Main from "../components/Layout/Main";
import MobileSensorSelectForm from "../components/Tools/MobileSensorSelectForm";
import MobileAccelerationForm from "../components/Tools/MobileAccelerationForm";
import MobilePhotoForm from "../components/Tools/MobilePhotoForm";
import { useAuthDispatch, useAuthState } from "../contexts/authContext";
import { IMobileTopic } from "../components/PlatformAssistant/TableColumns/topicsColumns";
import { useLoggedUserLogin } from "../contexts/authContext/authContext";
import { getAxiosInstance } from "../tools/axiosIntance";
import axiosErrorHandler from "../tools/axiosErrorHandler";
import MobileOrientationForm from "../components/Tools/MobileOrientationForm";
import MobileMotionForm from "../components/Tools/MobileMotionForm";
import styled from "styled-components";
import { AxiosResponse, AxiosError } from "axios";
import NatsConnect from "../tools/Natsconnection";
import MobileVideoForm from "../components/Tools/MobileVideoForm";

const LoadingItem = styled.div`
    background-color: #202226;
    font-size: 20px;
    display: flex;
    justify-content: center;
    align-items: center;
    width: 100%;
    height: 100%;
`;

export interface InitialMobileSensorData {
    orgAcronym: string;
    groupAcronym: string;
    assetName: string;
    assetDescription: string;
    mobileSensorDescription: string;
}

const domainName = getDomainName();
const protocol = getProtocol();

const MobileSensorsPage: FC<ChildrenProp> = ({ children }) => {
    const [loadingLabel, setLoadingLabel] = useState("Loading...");
    const [isNatsConnected, setIsNatsConnected] = useState(false);
    const [initialMobileSensorData, setInitialMobileSensorData] = useState<InitialMobileSensorData | null>(null);
    const [mobileSensorSelected, setMobileSensorSelected] = useState("none");
    const [mobileTopicsManaged, setMobileTopicsManaged] = useState<IMobileTopic[]>([]);
    const [mobileTopicSelected, setMobileTopicSelected] = useState<IMobileTopic | null>(null);
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();
    const userName = useLoggedUserLogin();
    const natsClientRef = useRef<NatsConnection | null>(null);
    const isMountedRef = useRef(true);

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    const safeSetIsNatsConnected: Dispatch<SetStateAction<boolean>> = (value) => {
        if (isMountedRef.current) {
            setIsNatsConnected(value);
        }
    };

    useEffect(() => {
        let cancelled = false;
        const urlTopics = `${protocol}://${domainName}/admin_api/topics_in_mobile/user_managed`;
        const config = axiosAuth(accessToken);
        getAxiosInstance(refreshToken, authDispatch)
            .get(urlTopics, config)
            .then((response: AxiosResponse<any, any>) => {
                if (cancelled) return;

                const mobileTopicsData: IMobileTopic[] = response.data;
                const mobileTopics = mobileTopicsData.filter((mobileTopic) => mobileTopic.sensorType !== "geolocation");
                if (mobileTopics.length !== 0) {
                    setMobileTopicsManaged(mobileTopics);
                    setMobileTopicSelected(mobileTopics[0]);
                    const initialMobileSensorData = {
                        orgAcronym: mobileTopics[0].orgAcronym,
                        groupAcronym: mobileTopics[0].groupAcronym,
                        assetName: `Asset_${mobileTopics[0].assetUid}`,
                        assetDescription: mobileTopics[0].assetDescription,
                        mobileSensor: mobileTopics[0].sensorType,
                        mobileSensorDescription: mobileTopics[0].sensorDescription,
                    };
                    setInitialMobileSensorData(initialMobileSensorData);
                } else {
                    setLoadingLabel("No mobile sensor found");
                }
            })
            .catch((error: AxiosError) => {
                if (cancelled) return; // 👈 también en el catch
                axiosErrorHandler(error, authDispatch);
            });

        return () => {
            cancelled = true;
        };
    }, [accessToken, refreshToken, authDispatch]);

    useEffect(() => {
        let cancelled = false;

        NatsConnect(safeSetIsNatsConnected, userName, accessToken) // 👈
            .then((nc) => {
                if (!cancelled) {
                    natsClientRef.current = nc;
                } else {
                    nc.close();
                }
            })
            .catch((err) => console.log("Could not connect to NATS:", err));

        return () => {
            cancelled = true;
            if (natsClientRef.current) {
                natsClientRef.current.close();
                natsClientRef.current = null;
            }
        };
    }, [userName, accessToken]);

    const handleMobileSensorSelection = (values: any, actions: any) => {
        const mobileSensorSelected = values.mobileSensorDescription;
        setMobileSensorSelected(mobileSensorSelected);
    };

    return (
        <>
            <Header />
            <Main>
                <>
                    {!initialMobileSensorData && <LoadingItem>{loadingLabel}</LoadingItem>}
                    {mobileSensorSelected === "none" && initialMobileSensorData !== null && (
                        <MobileSensorSelectForm
                            isNatsConnected={isNatsConnected}
                            handleMobileSensorSelection={handleMobileSensorSelection}
                            mobileTopicsManaged={mobileTopicsManaged}
                            initialMobileSensorData={initialMobileSensorData as InitialMobileSensorData}
                            setInitialMobileSensorData={setInitialMobileSensorData}
                            setMobileTopicSelected={setMobileTopicSelected}
                        />
                    )}
                    {mobileSensorSelected === "Mobile accelerations" && (
                        <MobileAccelerationForm
                            natsClient={natsClientRef.current as NatsConnection}
                            isNatsConnected={isNatsConnected}
                            setMobileSensorSelected={setMobileSensorSelected}
                            mobileTopicSelected={mobileTopicSelected as IMobileTopic}
                        />
                    )}
                    {mobileSensorSelected === "Mobile orientation" && (
                        <MobileOrientationForm
                            natsClient={natsClientRef.current as NatsConnection}
                            isNatsConnected={isNatsConnected}
                            setMobileSensorSelected={setMobileSensorSelected}
                            mobileTopicSelected={mobileTopicSelected as IMobileTopic}
                        />
                    )}
                    {mobileSensorSelected === "Mobile motion" && (
                        <MobileMotionForm
                            natsClient={natsClientRef.current as NatsConnection}
                            isNatsConnected={isNatsConnected}
                            setMobileSensorSelected={setMobileSensorSelected}
                            mobileTopicSelected={mobileTopicSelected as IMobileTopic}
                        />
                    )}
                    {mobileSensorSelected === "Mobile photo" && (
                        <MobilePhotoForm
                            natsClient={natsClientRef.current as NatsConnection}
                            isNatsConnected={isNatsConnected}
                            setMobileSensorSelected={setMobileSensorSelected}
                            mobileTopicSelected={mobileTopicSelected as IMobileTopic}
                        />
                    )}
                    {mobileSensorSelected === "Mobile video" && (
                        <MobileVideoForm
                            natsClient={natsClientRef.current as NatsConnection}
                            isNatsConnected={isNatsConnected}
                            setMobileSensorSelected={setMobileSensorSelected}
                            mobileTopicSelected={mobileTopicSelected as IMobileTopic}
                        />
                    )}
                </>
            </Main>
        </>
    );
};

export default MobileSensorsPage;
