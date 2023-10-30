import { FC } from 'react';
import styled from "styled-components";
import Spinner from "react-loader-spinner";


const LoaderContainer = styled.div`
	display: flex;
	justify-content: center;
	align-items: center;
	width: 100%;
	height: 100%;
`;

const StyledLoader = styled(Spinner)`
	background-color: #202226;
`

const Loader: FC<{}> = () => {
	return (
		<LoaderContainer>
			<StyledLoader type="Oval" color="#3274d9" secondaryColor="#235197" height={150} width={150} />
		</LoaderContainer>
	);
};

export default Loader;