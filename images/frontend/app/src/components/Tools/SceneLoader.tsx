import { FC } from 'react';
import styled from "styled-components";
import Spinner from "react-loader-spinner";


const SceneLoaderContainer = styled.div`
	display: flex;
	justify-content: center;
    flex-direction: row;
	align-items: center;
	width: 100%;
	height: 100%;
`;

const Text = styled.div`
    margin: 0 20px;
    font-size: 16px;
`

const StyledLoader = styled(Spinner)`
	background-color: #202226;
`



const SceneLoader: FC<{}> = () => {
    return (
        <SceneLoaderContainer>
            <Text>Loading scene</Text>
            <StyledLoader type="Oval" color="#3274d9" secondaryColor="#235197" height={20} width={20} />
        </SceneLoaderContainer>
    );
};

export default SceneLoader;