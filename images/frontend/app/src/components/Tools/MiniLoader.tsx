import { FC } from 'react';
import styled from "styled-components";
import Spinner from "react-loader-spinner";

const LoaderContainer = styled.div`
	margin-left: 20px;
	background-color: #202226;
`;


const MiniLoader: FC<{}> = () => {
	return (
		<LoaderContainer >
			<Spinner type="Oval" color="#3274d9" height={20} width={20} />
		</LoaderContainer >
	);
};

export default MiniLoader;