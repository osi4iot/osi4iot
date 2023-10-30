import { FC } from 'react';
import styled from "styled-components";
import { Oval } from "react-loader-spinner";

const LoaderContainer = styled.div`
	margin-left: 20px;
	background-color: #202226;
`;


const MiniLoader: FC<{}> = () => {
	return (
		<LoaderContainer >
			<Oval color="#3274d9" secondaryColor="#235197" height={20} width={20} />
		</LoaderContainer >
	);
};

export default MiniLoader;