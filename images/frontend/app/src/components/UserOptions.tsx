import React, { FC, useState } from 'react'
import styled from "styled-components";

const UserOptionsContainer = styled.div`
	display: flex;
	flex-direction: row;
    justify-content: flex-start;
	align-items: center;
    width: 60%;
    height: 50px;
    background-color: #0c0d0f;
`;

interface OptionContainerProps {
    isOptionActive: boolean;
}

const OptionContainer = styled.div<OptionContainerProps>`
	color: "white";
    margin: 10px 20px 0 20px;
    background-color: ${(props) => props.isOptionActive ? "#202226" : "#0c0d0f"};
    padding: 10px 10px 10px 10px;
    border-top: ${(props) => props.isOptionActive ? "3px solid #3274d9;" : "3px solid #0c0d0f"};
    align-content: center;

    &:hover {
        cursor: pointer;
        background-color: #202226;
        border-top: ${(props) => props.isOptionActive ? "3px solid #3274d9;" : "3px solid white"};
    }
`;

const ContentContainer = styled.div`
    width: calc(100vw - 75px);
    height: calc(100vh - 200px);
    background-color: #202226;
    margin-bottom: 5px;
    display: flex;
	flex-direction: column;
    justify-content: flex-start;
	align-items: center;
    overflow: auto;
`;

const UserOptions: FC<{}> = () => {
    const [optionToShow, setOptionToShow] = useState("Profile");

    const clickHandler = (optionToShow: string) => {
        setOptionToShow(optionToShow);
    }
    
    return (
        <>
            <UserOptionsContainer>
                <OptionContainer isOptionActive={optionToShow === "User Data"} onClick={() => clickHandler("User Data")}>
                    User Data
                </OptionContainer>
            </UserOptionsContainer>
            <ContentContainer >

            </ContentContainer>
        </>
    )
}

export default UserOptions;
