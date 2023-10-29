import { FC } from 'react';
import styled from "styled-components";
import { Oval } from "react-loader-spinner";

const LoaderContainer = styled.div`
	display: flex;
	justify-content: center;
	align-items: center;
	width: 100%;
	height: 100%;
`;

const StyledLoader = styled(Oval)`
	background-color: #202226;
`

const Loader: FC<{}> = () => {
	return (
		<LoaderContainer>
			<StyledLoader color="#3274d9" height={150} width={150} />
		</LoaderContainer>
	);
};

export default Loader;