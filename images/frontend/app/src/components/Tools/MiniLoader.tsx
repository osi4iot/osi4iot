import { FC } from 'react';
import styled from "styled-components";
import Spinner from "react-loader-spinner";


const StyledLoader = styled(Spinner)`
	background-color: #202226;
    display: inline;
`

const MiniLoader: FC<{}> = () => {
	return (
        <StyledLoader type="Oval" color="#3274d9" height={20} width={20} />
	);
};

export default MiniLoader;