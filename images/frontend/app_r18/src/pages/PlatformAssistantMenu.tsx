import React, { FC } from "react";
import styled, { IStyledComponent } from "styled-components";
import { FaHome, FaUser, FaUsers, FaUniversity } from "react-icons/fa";
import { IconType } from "react-icons";
import {
    useIsGroupAdmin,
    useIsOrgAdmin,
    useIsPlatformAdmin
} from "../contexts/platformAssistantContext";
import {
    PLATFORM_ASSISTANT_OPTION,
    PLATFORM_ASSISTANT_ROUTES
} from "../components/PlatformAssistant/Utils/platformAssistantOptions";
import { useNavigate } from "react-router-dom";


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


const StyledIcon = (icon: IconType): IStyledComponent<any, any> => {
    const styledIcon = (styled(icon)`
        font-size: 30px;
    `) as IStyledComponent<any, any>;
    return styledIcon;
}

const FaHometyled = StyledIcon(FaHome);
const FaUserStyled = StyledIcon(FaUser);
const FaUsersStyled = StyledIcon(FaUsers);
const FaUniversityStyled = StyledIcon(FaUniversity);

interface IconContainerProps {
    isActive: boolean;
}

const IconContainer = styled.div.withConfig({
	shouldForwardProp: (prop) => prop !== 'isActive'
  })<IconContainerProps>`
	background-color: #141619;
	width: 50px;
    margin-top: 10px;
	margin-bottom: 10px;
	padding: 10px;
	display: flex;
	justify-content: center;
	align-items: center;
    border: ${(props) => (props.isActive ? '1px solid#3274d9;' : '1px solid #141619')};

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

interface PlatformLogoContainerProps {
    isActive: boolean;
}

const PlatformLogoContainer = styled.div.withConfig({
	shouldForwardProp: (prop) => prop !== 'isActive'
  })<PlatformLogoContainerProps>`
	background-color: #141619;
	width: 50px;
    height: 50px;
    padding-top: 3px;
    margin-top: 10px;
	margin-bottom: 10px;
    border: ${(props) => (props.isActive ? '1px solid#3274d9;' : '1px solid #141619')};

    &:hover {
		border: 1px solid white;
		cursor: pointer;
	}
`;

interface PlatformAssistantMenuProps {
	platformAssistantOptionToShow: string;
}

const PlatformAssistantMenu: FC<PlatformAssistantMenuProps> = ({platformAssistantOptionToShow}) => {
    const isPlatformAdmin = useIsPlatformAdmin();
    const isOrgAdmin = useIsOrgAdmin();
    const isGroupdmin = useIsGroupAdmin();
    const navigate = useNavigate();

    const clickHandler = (routeToShow: string) => {
        navigate(routeToShow);
    }

    return (
        <Menu>
            <IconContainer
                isActive={platformAssistantOptionToShow === PLATFORM_ASSISTANT_OPTION.HOME}
                onClick={() => clickHandler(PLATFORM_ASSISTANT_ROUTES.HOME)}
            >
                <FaHometyled />
            </IconContainer>
            <IconContainer
                isActive={platformAssistantOptionToShow === PLATFORM_ASSISTANT_OPTION.USER}
                onClick={() => clickHandler(PLATFORM_ASSISTANT_ROUTES.USER)}
            >
                <FaUserStyled />
            </IconContainer>
            {(isGroupdmin || isOrgAdmin || isPlatformAdmin) &&
                <IconContainer
                    isActive={platformAssistantOptionToShow === PLATFORM_ASSISTANT_OPTION.GROUP_ADMIN}
                    onClick={() => clickHandler(PLATFORM_ASSISTANT_ROUTES.GROUP_ADMIN)}
                >
                    <FaUsersStyled />
                </IconContainer>
            }
            {(isOrgAdmin || isPlatformAdmin) &&
                <IconContainer
                    isActive={platformAssistantOptionToShow === PLATFORM_ASSISTANT_OPTION.ORG_ADMIN}
                    onClick={() => clickHandler(PLATFORM_ASSISTANT_ROUTES.ORG_ADMIN)}
                >
                    <FaUniversityStyled />
                </IconContainer>
            }
            {isPlatformAdmin &&
                <PlatformLogoContainer
                    isActive={platformAssistantOptionToShow === PLATFORM_ASSISTANT_OPTION.PLATFORM_ADMIN}
                    onClick={() => clickHandler(PLATFORM_ASSISTANT_ROUTES.PLATFORM_ADMIN)}
                >
                    <PlatformLogo src="../../plaftorm_logo.png" alt="PlatformLogo" />
                </PlatformLogoContainer>
            }
        </Menu>
    );
};

export default PlatformAssistantMenu;