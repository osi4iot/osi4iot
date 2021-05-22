import React, { FC } from "react";
import styled from "styled-components";
import Main from "../components/Layout/Main";
import Header from "../components/Layout/Header";
import PlatformAssistantMenu from "../components/PlatformAssistant/PlatformAssistantMenu";
import PlatformAdminOptions from "../components/PlatformAssistant/PlatformAdminOptions";
import { PLATFORM_ASSISTANT_OPTION } from "../components/PlatformAssistant/platformAssistantOptions";

const Container = styled.div`
    display: flex;
    flex-direction: column;
    justify-content: center;
	align-items: center;
    width: calc(100vw - 60px);
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


const PlatformAssistantPageAdmin: FC<{}> = () => {
	return (
		<>
			<Header />
			<Main>
				<>
					<PlatformAssistantMenu platformAssistantOptionToShow={PLATFORM_ASSISTANT_OPTION.PLATFORM_ADMIN}/>
					<Container>
						<Title>Platform assistant for superadmin</Title>
						<PlatformAdminOptions />
					</Container>
				</>
			</Main>
		</>
	);
};

export default PlatformAssistantPageAdmin;