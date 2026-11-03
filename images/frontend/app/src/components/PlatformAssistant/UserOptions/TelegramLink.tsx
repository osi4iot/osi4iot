// Link of the user's Telegram account (admin_api's telegramLinkDAL): the Approval nodes only take Telegram
// decisions from group administrators whose account is linked. The user gets a one-time code here and sends it to
// its organization's Telegram bot as "/link <code>".
import { FC, useState } from "react";
import styled from "styled-components";
import { toast } from "react-toastify";
import { AxiosError, AxiosResponse } from "axios";
import { useAuthDispatch, useAuthState } from "../../../contexts/authContext";
import { axiosAuth, getDomainName, getProtocol } from "../../../tools/tools";
import { getAxiosInstance } from "../../../tools/axiosIntance";
import axiosErrorHandler from "../../../tools/axiosErrorHandler";

const Container = styled.div`
    margin-top: 10px;
    margin-bottom: 10px;
    width: 100%;
`;

const Title = styled.span`
    font-weight: 600;
    margin-right: 5px;
`;

const Hint = styled.div`
    margin-top: 6px;
    color: #9ca3af;
    font-size: 13px;
    line-height: 1.5;
`;

const Code = styled.code`
    padding: 2px 8px;
    border-radius: 4px;
    background: #111827;
    border: 1px solid #4b5563;
    font-size: 15px;
    letter-spacing: 1px;
    user-select: all;
`;

const SmallButton = styled.button`
    margin-top: 8px;
    margin-right: 8px;
    padding: 6px 12px;
    border: 1px solid #4b5563;
    border-radius: 8px;
    background: transparent;
    color: #e5e7eb;
    cursor: pointer;

    &:hover {
        border-color: #3274d9;
    }

    &:disabled {
        opacity: 0.5;
        cursor: default;
    }
`;

interface TelegramLinkProps {
    telegramLinked?: boolean;
    telegramUsername?: string;
    refreshUserProfile: () => void;
}

const domainName = getDomainName();
const protocol = getProtocol();

const TelegramLink: FC<TelegramLinkProps> = ({ telegramLinked, telegramUsername, refreshUserProfile }) => {
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();
    const [linkCode, setLinkCode] = useState<{ code: string; expiresAt: string } | null>(null);
    const [busy, setBusy] = useState(false);

    const askForCode = () => {
        setBusy(true);
        getAxiosInstance(refreshToken, authDispatch)
            .post(`${protocol}://${domainName}/admin_api/auth/telegram_link_code`, {}, axiosAuth(accessToken))
            .then((response: AxiosResponse<{ code: string; expiresAt: string }>) => setLinkCode(response.data))
            .catch((error: AxiosError) => axiosErrorHandler(error, authDispatch))
            .finally(() => setBusy(false));
    };

    const unlink = () => {
        setBusy(true);
        getAxiosInstance(refreshToken, authDispatch)
            .delete(`${protocol}://${domainName}/admin_api/auth/telegram_link`, axiosAuth(accessToken))
            .then((response: AxiosResponse<{ message: string }>) => {
                toast.success(response.data.message);
                setLinkCode(null);
                refreshUserProfile();
            })
            .catch((error: AxiosError) => axiosErrorHandler(error, authDispatch))
            .finally(() => setBusy(false));
    };

    return (
        <Container>
            <Title>Telegram:</Title>
            <span>{telegramLinked ? `linked${telegramUsername ? ` (@${telegramUsername})` : ""}` : "not linked"}</span>
            <Hint>Group administrators with a linked account can approve or reject the Approval requests from Telegram.</Hint>
            {linkCode && (
                <Hint>
                    Send <Code>/link {linkCode.code}</Code> to your organization's Telegram bot, before{" "}
                    {new Date(linkCode.expiresAt).toLocaleTimeString()}. Then refresh this page.
                </Hint>
            )}
            <div>
                <SmallButton type="button" disabled={busy} onClick={askForCode}>
                    {telegramLinked ? "Link another account" : "Link Telegram account"}
                </SmallButton>
                {telegramLinked && (
                    <SmallButton type="button" disabled={busy} onClick={unlink}>
                        Unlink
                    </SmallButton>
                )}
                {linkCode && (
                    <SmallButton type="button" disabled={busy} onClick={refreshUserProfile}>
                        Refresh
                    </SmallButton>
                )}
            </div>
        </Container>
    );
};

export default TelegramLink;
