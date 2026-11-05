// Approvals: the pending requests of the Approval nodes of all the digital twins of the groups the user
// administers, to approve or reject them in one place (from the home page).
import { FC } from "react";
import styled from "styled-components";
import Header from "../components/Layout/Header";
import Main from "../components/Layout/Main";
import ApprovalsBoard from "../components/Approvals/ApprovalsBoard";
import { useApprovalTargets, useNatsClient } from "../components/Approvals/useApprovals";
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

const ApprovalsPage: FC<{}> = () => {
    const userName = useLoggedUserLogin();
    const targets = useApprovalTargets();
    const { natsClient, isNatsConnected } = useNatsClient();

    return (
        <>
            <Header />
            <Main>
                {targets === null ? (
                    <LoadingItem>Loading...</LoadingItem>
                ) : targets.length === 0 ? (
                    <LoadingItem>None of your digital twins has Approval nodes decided from the platform</LoadingItem>
                ) : (
                    <ApprovalsBoard natsClient={natsClient} isNatsConnected={isNatsConnected} userName={userName} targets={targets} />
                )}
            </Main>
        </>
    );
};

export default ApprovalsPage;
