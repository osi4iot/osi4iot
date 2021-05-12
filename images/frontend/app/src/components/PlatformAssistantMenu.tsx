import React, { FC } from "react";
import styled, { StyledComponent } from "styled-components";
import { FaUser, FaUsers, FaUniversity } from "react-icons/fa";
import { IconType } from "react-icons";
import { useIsGroupAdmin, useIsOrgAdmin, useIsPlatformAdmin, usePlatformAssitantDispatch } from "../contexts/platformAssistantContext";
import { setPlaformOptionsToShow } from "../contexts/platformAssistantContext/platformAssistantAction";
import PLATFORM_ASSISTANT_OPTIONS from "../contexts/platformAssistantContext/platformAssistantOptions";

const Menu = styled.div`
	background-color: #141619;
	color: white;
	display: flex;
    flex-direction: column;
	justify-content: flex-start;
	align-items: center;
	height: 100%;
	width: 60px;
    padding-top: 20px;
`;


const StyledIcon = (icon: IconType): StyledComponent<IconType, any, {}, never> => {
    const styledIcon = (styled(icon)`
        font-size: 30px;
    `) as StyledComponent<IconType, any, {}, never>;
    return styledIcon;
}

const FaUserStyled = StyledIcon(FaUser);
const FaUsersStyled = StyledIcon(FaUsers);
const FaUniversityStyled = StyledIcon(FaUniversity);

const IconContainer = styled.div`
	background-color: #141619;
	width: 50px;
    margin-top: 10px;
	margin-bottom: 10px;
	padding: 10px;
	display: flex;
	justify-content: center;
	align-items: center;
    border: 1px solid #141619;

    &:hover {
		border: 1px solid white;
		cursor: pointer;
	}
`;

const PlatformLogo = styled.img`
	width: 40px;
    height: 40px;
    display: block;
    margin: auto;
	object-fit: cover;
`;

const PlatformLogoContainer = styled.div`
	background-color: #141619;
	width: 50px;
    height: 50px;
    padding-top: 3px;
    margin-top: 10px;
	margin-bottom: 10px;
    border: 1px solid #141619;

    &:hover {
		border: 1px solid white;
		cursor: pointer;
	}
`;

const PlatformAssistantMenu: FC<{}> = () => {
    const platformAssistantDispatch = usePlatformAssitantDispatch();
    const isPlatformAdmin = useIsPlatformAdmin();
    const isOrgAdmin = useIsOrgAdmin();
    const isGroupdmin = useIsGroupAdmin();

    const clickHandler = (platformOptionsToShow: string) => {
        const platformAssistantOptionsToShow = { platformOptionsToShow };
        setPlaformOptionsToShow(platformAssistantDispatch, platformAssistantOptionsToShow);
    }

    return (
        <Menu>
            <IconContainer onClick={() => clickHandler(PLATFORM_ASSISTANT_OPTIONS.USER)}>
                <FaUserStyled />
            </IconContainer>
            {(isGroupdmin || isOrgAdmin || isPlatformAdmin) &&
                <IconContainer  onClick={() => clickHandler(PLATFORM_ASSISTANT_OPTIONS.GROUP_ADMIN )}>
                    <FaUsersStyled />
                </IconContainer>
            }
            {(isOrgAdmin || isPlatformAdmin) &&
                <IconContainer onClick={() => clickHandler(PLATFORM_ASSISTANT_OPTIONS.ORG_ADMIN)} >
                    <FaUniversityStyled />
                </IconContainer>
            }
            {isPlatformAdmin &&
                <PlatformLogoContainer onClick={() => clickHandler(PLATFORM_ASSISTANT_OPTIONS.PLATFORM_ADMIN)} >
                    <PlatformLogo src="plaftorm_logo.png" alt="PlatformLogo" />
                </PlatformLogoContainer>
            }
        </Menu>
    );
};

export default PlatformAssistantMenu;