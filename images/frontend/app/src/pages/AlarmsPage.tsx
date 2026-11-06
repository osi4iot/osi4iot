// Alarms: the alarms that are not normal of the Alarm nodes of all the digital twins of the groups the user
// administers (also the acknowledged ones, until they clear), to acknowledge, shelve or reset them (from the home page).
import { FC } from "react";
import styled from "styled-components";
import Header from "../components/Layout/Header";
import Main from "../components/Layout/Main";
import AlarmsBoard from "../components/Approvals/AlarmsBoard";
import { useAlarmTargets, useNatsClient } from "../components/Approvals/useApprovals";
import { useLoggedUserLogin } from "../contexts/authContext/authContext";

const LoadingItem = styled.div`
    background-color: #202226;
    font-size: 20px;
    display: flex;
    justify-content: center;
    align-items: center;
    width: 100%;
    height: 100%;
`;

const AlarmsPage: FC<{}> = () => {
    const userName = useLoggedUserLogin();
    const targets = useAlarmTargets();
    const { natsClient, isNatsConnected } = useNatsClient();

    return (
        <>
            <Header />
            <Main>
                {targets === null ? (
                    <LoadingItem>Loading...</LoadingItem>
                ) : targets.length === 0 ? (
                    <LoadingItem>None of your digital twins has Alarm nodes</LoadingItem>
                ) : (
                    <AlarmsBoard natsClient={natsClient} isNatsConnected={isNatsConnected} userName={userName} targets={targets} />
                )}
            </Main>
        </>
    );
};

export default AlarmsPage;
