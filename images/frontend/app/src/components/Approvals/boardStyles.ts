// The look shared by the Approvals and Alarms pages: the platform's dark cards, by asset.
import styled from "styled-components";
import { scrollbarStyle } from "../Tools/FormTools";

export const Page = styled.div`
    box-sizing: border-box;
    width: min(1080px, 100%);
    margin: 0 auto;
    padding: 18px 16px 32px;
    display: flex;
    flex-direction: column;
    gap: 14px;

    @media (max-width: 600px) {
        padding: 8px 8px 24px;
    }
`;

export const Head = styled.div`
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px 16px;
`;

export const Title = styled.h2`
    margin: 0;
    font-weight: 500;
    font-size: 18px;
    color: white;
    display: flex;
    align-items: center;
    gap: 10px;
`;

export const Count = styled.span<{ $zero: boolean }>`
    min-width: 22px;
    padding: 0 7px;
    border-radius: 11px;
    font-size: 12px;
    line-height: 22px;
    text-align: center;
    color: white;
    background: ${({ $zero }) => ($zero ? "#2a2d33" : "#f2495c")};
`;

export const Tools = styled.div`
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 10px;
    color: #9ca3af;
    font-size: 12px;

    @media (max-width: 600px) {
        margin-left: 0;
        width: 100%;
    }
`;

export const Select = styled.select`
    height: 32px;
    padding: 0 8px;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: #202226;
    color: #e5e7eb;
    font-size: 13px;

    @media (max-width: 600px) {
        flex: 1;
        min-width: 0;
    }
`;

export const IconButton = styled.button`
    display: inline-grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: #202226;
    color: #e5e7eb;
    cursor: pointer;

    &:hover {
        background: #2a2d33;
    }

    &:focus-visible {
        outline: 2px solid #3d82f0;
        outline-offset: 2px;
    }
`;

export const Notice = styled.div<{ $error?: boolean }>`
    padding: 10px 14px;
    border-radius: 10px;
    font-size: 13px;
    color: ${({ $error }) => ($error ? "#ffb3b3" : "#c3c9d1")};
    background: ${({ $error }) => ($error ? "rgba(242, 73, 92, 0.12)" : "#202226")};
    border: 1px solid ${({ $error }) => ($error ? "rgba(242, 73, 92, 0.35)" : "rgba(255, 255, 255, 0.08)")};
`;

export const Empty = styled.div`
    padding: 48px 20px;
    border-radius: 14px;
    border: 1px dashed rgba(255, 255, 255, 0.14);
    text-align: center;
    color: #9ca3af;
    font-size: 14px;

    strong {
        display: block;
        margin: 10px 0 4px;
        color: #e5e7eb;
        font-weight: 500;
        font-size: 16px;
    }
`;

export const AssetCard = styled.section`
    background-color: #202226;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 14px;
    overflow: hidden;
`;

export const AssetHead = styled.header`
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 4px 12px;
    padding: 12px 18px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);

    h3 {
        margin: 0;
        font-size: 15px;
        font-weight: 500;
        color: white;
    }

    span {
        color: #9ca3af;
        font-size: 12px;
    }
`;

export const Requests = styled.div`
    max-height: 70vh;
    overflow-y: auto;
    ${scrollbarStyle}
`;

export const Meta = styled.div`
    margin-top: 6px;
    color: #8b94a1;
    font-size: 12px;

    b {
        font-weight: 500;
        color: #a7b1be;
    }
`;

export const Unreachable = styled.div`
    padding: 8px 18px 12px;
    color: #ffb3b3;
    font-size: 12px;
`;
