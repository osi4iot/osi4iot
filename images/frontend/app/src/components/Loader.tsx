import { FC } from 'react';
import styled from "styled-components";
import Spinner from "react-loader-spinner";


const StyledLoader = styled(Spinner)`
	background-color: #202226;
	margin-top: 100px;
`

const Loader: FC<{}> = () => {
	return (
		<StyledLoader type="Oval" color="#3274d9" height={150} width={150} />
	);
};

export default Loader;