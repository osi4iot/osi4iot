import { FC, useState, useEffect, useRef, SetStateAction, Dispatch } from "react";
import { type NatsConnection } from "@nats-io/nats-core";
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
import MobileAudioForm from "../components/Tools/MobileAudioForm";
import MobileGeolocationForm from "../components/Tools/MobileGeolocationForm";
import { findMobileTopic, isMobileSensorType, recallMobileSelection, rememberMobileSelection } from "../tools/mobileSensors";
import { topicKindOf, usePermissionViolations } from "../tools/natsPermissions";

const LoadingItem = styled.div`
    background-color: #202226;
    font-size: 20px;
    display: flex;
    justify-content: center;
    align-items: center;
    width: 100%;
    height: 100%;
`;

// what the server refused to the phone (README, "Permissions": only Editors and Admins send data from it)
const Refused = styled.div`
    margin: 8px;
    padding: 10px 12px;
    border: 1px solid rgba(242, 73, 92, 0.45);
    border-radius: 8px;
    background: rgba(242, 73, 92, 0.14);
    color: #ffb3bb;
    font-size: 14px;
    line-height: 1.4;
`;

export const NO_MOBILE_SENSORS_TEXT =
    "No mobile sensor in the groups you edit or administer. Sending data from the phone needs the Editor or Admin role in the group.";

export interface InitialMobileSensorData {
    orgAcronym: string;
    groupAcronym: string;
    assetName: string;
    assetDescription: string;
    mobileSensorDescription: string;
}

// the values of the selection form for a sensor's topic
const selectionOf = (topic: IMobileTopic): InitialMobileSensorData => ({
    orgAcronym: topic.orgAcronym,
    groupAcronym: topic.groupAcronym,
    assetName: `Asset_${topic.assetUid}`,
    assetDescription: topic.assetDescription,
    mobileSensorDescription: topic.sensorDescription,
});

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
    // a publication the server refused: the light is not green, whatever the connection says
    const refusedPublications = usePermissionViolations().filter((v) => v.operation === "publish");
    const canSend = isNatsConnected && refusedPublications.length === 0;

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

                // every asset with at least one mobile sensor (admin_api already lists only those)
                const mobileTopicsData: IMobileTopic[] = response.data;
                const mobileTopics = mobileTopicsData.filter((mobileTopic) => isMobileSensorType(mobileTopic.sensorType));
                if (mobileTopics.length !== 0) {
                    setMobileTopicsManaged(mobileTopics);
                    // the sensor chosen last time on this device, else the first one
                    const topic = recallMobileSelection(mobileTopics) ?? mobileTopics[0];
                    setMobileTopicSelected(topic);
                    setInitialMobileSensorData(selectionOf(topic));
                } else {
                    setLoadingLabel(NO_MOBILE_SENSORS_TEXT);
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

    // The form opens by the sensor's type, not its description: a sensor of
    // type "Mobile accelerations" described "Front axle phone" opens the
    // accelerations form.
    const handleMobileSensorSelection = (values: any, actions: any) => {
        const topic = findMobileTopic(mobileTopicsManaged, values.assetName, values.mobileSensorDescription);
        if (!topic) return;
        // back from the sensor's form (Cancel) or on the next visit, the selection form opens with this sensor
        rememberMobileSelection(topic);
        setInitialMobileSensorData(selectionOf(topic));
        setMobileTopicSelected(topic);
        setMobileSensorSelected(topic.sensorType);
    };

    return (
        <>
            <Header />
            <Main>
                <>
                    {refusedPublications.length > 0 && (
                        <Refused role="alert">
                            The server refused to send the data ({refusedPublications.map((v) => topicKindOf(v.subject)).join(", ")}).
                            Sending data from the phone needs the Editor or Admin role in the group.
                        </Refused>
                    )}
                    {!initialMobileSensorData && <LoadingItem>{loadingLabel}</LoadingItem>}
                    {mobileSensorSelected === "none" && initialMobileSensorData !== null && (
                        <MobileSensorSelectForm
                            isNatsConnected={canSend}
                            handleMobileSensorSelection={handleMobileSensorSelection}
                            mobileTopicsManaged={mobileTopicsManaged}
                            initialMobileSensorData={initialMobileSensorData as InitialMobileSensorData}
                            setInitialMobileSensorData={setInitialMobileSensorData}
                            setMobileTopicSelected={setMobileTopicSelected}
                        />
                    )}
                    {mobileSensorSelected === "Mobile geolocation" && (
                        <MobileGeolocationForm
                            natsClient={natsClientRef.current as NatsConnection}
                            isNatsConnected={canSend}
                            setMobileSensorSelected={setMobileSensorSelected}
                            mobileTopicSelected={mobileTopicSelected as IMobileTopic}
                        />
                    )}
                    {mobileSensorSelected === "Mobile accelerations" && (
                        <MobileAccelerationForm
                            natsClient={natsClientRef.current as NatsConnection}
                            isNatsConnected={canSend}
                            setMobileSensorSelected={setMobileSensorSelected}
                            mobileTopicSelected={mobileTopicSelected as IMobileTopic}
                        />
                    )}
                    {mobileSensorSelected === "Mobile orientation" && (
                        <MobileOrientationForm
                            natsClient={natsClientRef.current as NatsConnection}
                            isNatsConnected={canSend}
                            setMobileSensorSelected={setMobileSensorSelected}
                            mobileTopicSelected={mobileTopicSelected as IMobileTopic}
                        />
                    )}
                    {mobileSensorSelected === "Mobile motion" && (
                        <MobileMotionForm
                            natsClient={natsClientRef.current as NatsConnection}
                            isNatsConnected={canSend}
                            setMobileSensorSelected={setMobileSensorSelected}
                            mobileTopicSelected={mobileTopicSelected as IMobileTopic}
                        />
                    )}
                    {mobileSensorSelected === "Mobile photo" && (
                        <MobilePhotoForm
                            natsClient={natsClientRef.current as NatsConnection}
                            isNatsConnected={canSend}
                            setMobileSensorSelected={setMobileSensorSelected}
                            mobileTopicSelected={mobileTopicSelected as IMobileTopic}
                        />
                    )}
                    {mobileSensorSelected === "Mobile video" && (
                        <MobileVideoForm
                            natsClient={natsClientRef.current as NatsConnection}
                            isNatsConnected={canSend}
                            setMobileSensorSelected={setMobileSensorSelected}
                            mobileTopicSelected={mobileTopicSelected as IMobileTopic}
                        />
                    )}
                    {mobileSensorSelected === "Mobile audio" && (
                        <MobileAudioForm
                            natsClient={natsClientRef.current as NatsConnection}
                            isNatsConnected={canSend}
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
