import { FC } from "react";
import styled from "styled-components";
import Main from "../components/Layout/Main";
import Header from "../components/Layout/Header";
import PlatformAssistantMenu from "./PlatformAssistantMenu";
import UserOptions from "../components/PlatformAssistant/UserOptions/UserOptions";
import { PLATFORM_ASSISTANT_OPTION } from "../components/PlatformAssistant/Utils/platformAssistantOptions";

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


const PlatformAssistantPageUser: FC<{}> = () => {

	return (
		<>
			<Header />
			<Main>
				<>
					<PlatformAssistantMenu platformAssistantOptionToShow={PLATFORM_ASSISTANT_OPTION.USER}/>
					<Container>
						<Title>Platform assistant for user</Title>
                        <UserOptions />
					</Container>
				</>
			</Main>
		</>
	);
};

export default PlatformAssistantPageUser;