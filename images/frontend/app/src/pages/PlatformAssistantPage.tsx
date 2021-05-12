import { FC, useEffect } from "react";
import styled from "styled-components";
import Main from "../components/Main";
import Header from "../components/Header";
import PlatformAssistantMenu from "../components/PlatformAssistantMenu";
import { useAuthState } from "../contexts/authContext";
import { usePlatformAssitantDispatch } from "../contexts/platformAssistantContext";
import { axiosAuth, getDomainName } from "../tools/tools";
import axios from "axios";
import { setUserRole } from "../contexts/platformAssistantContext";
import PlatformAdminOptions from "../components/PlatformAdminOptions";
import OrganizationAdminOptions from "../components/OrganizationAdminOptions";
import GroupAdminOptions from "../components/GroupAdminOptions";
import { setPlaformOptionsToShow } from "../contexts/platformAssistantContext/platformAssistantAction";
import PLATFORM_ASSISTANT_OPTIONS from "../contexts/platformAssistantContext/platformAssistantOptions";
import { usePlatformAsistantOptionsToShow } from "../contexts/platformAssistantContext/platformAssistantContext";
import UserOptions from "../components/UserOptions";

const Container = styled.div`
    display: flex;
    flex-direction: column;
    justify-content: center;
	align-items: center;
    width: calc(100vw - 60px)
`;


const Title = styled.h2`
	font-size: 20px;
	margin-top: 20px;
	margin-bottom: 20px;
	font-weight: 400;
	text-align: center;
	color: white;
	width: 100%;
`;

const domainName = getDomainName();

const getDefaultPlatformAssistantOptionsToShow = (userRole: string) => {
	let platformAssistantOptionsToShow = PLATFORM_ASSISTANT_OPTIONS.USER;
	if (userRole === "PlatformAdmin") platformAssistantOptionsToShow = PLATFORM_ASSISTANT_OPTIONS.PLATFORM_ADMIN;
	else if (userRole === "OrgAdmin") platformAssistantOptionsToShow = PLATFORM_ASSISTANT_OPTIONS.ORG_ADMIN;
	else if (userRole === "GroupAdmin") platformAssistantOptionsToShow = PLATFORM_ASSISTANT_OPTIONS.GROUP_ADMIN;
	return platformAssistantOptionsToShow;
}

const PlatformAssistantPage: FC<{}> = () => {
	const { accessToken } = useAuthState();
	const platformAssistantDispatch = usePlatformAssitantDispatch();
	const plattformAsistantOptionsToShow = usePlatformAsistantOptionsToShow();

	useEffect(() => {
		const url = `https://${domainName}/admin_api/auth/user_managed_components`;
		const config = axiosAuth(accessToken);
		axios
			.get(url, config)
			.then((response) => {
				const data = response.data;
				setUserRole(platformAssistantDispatch, data);
				const defaultPlatformAssistantOptionsToShow = getDefaultPlatformAssistantOptionsToShow(data.userRole);
				const platformOptionsToShow = { platformOptionsToShow: defaultPlatformAssistantOptionsToShow };
				setPlaformOptionsToShow(platformAssistantDispatch, platformOptionsToShow);
			})
			.catch((error) => {
				console.log(error);
			});
	}, [accessToken, platformAssistantDispatch]);

	return (
		<>
			<Header />
			<Main>
				<>
					<PlatformAssistantMenu />
					<Container>
						<Title>Platform assistant</Title>
						{plattformAsistantOptionsToShow === PLATFORM_ASSISTANT_OPTIONS.PLATFORM_ADMIN
							&& <PlatformAdminOptions />}

						{plattformAsistantOptionsToShow === PLATFORM_ASSISTANT_OPTIONS.ORG_ADMIN
							&& <OrganizationAdminOptions />}

						{plattformAsistantOptionsToShow === PLATFORM_ASSISTANT_OPTIONS.GROUP_ADMIN
							&& <GroupAdminOptions />}

						{plattformAsistantOptionsToShow === PLATFORM_ASSISTANT_OPTIONS.USER
							&& <UserOptions />}

					</Container>
				</>
			</Main>
		</>
	);
};

export default PlatformAssistantPage;