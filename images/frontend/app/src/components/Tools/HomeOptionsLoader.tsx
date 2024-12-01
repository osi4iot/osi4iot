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

const ProgressContainer = styled.div`
	position: relative;
	width: 75%;
    height: 100px;
	max-width: 375px;
`;

const ProgressBarContainer = styled.div`
	display: flex;
    flex-direction: row;
    width: 100%;
	justify-content: center;
	align-items: center;
`;

const ProgressLabel = styled.div`
    margin: 5px 0;
`;

const ProgressPercentage = styled.div`
    align-self: end;
`;

const ProgressBar = styled.div`
    width: 90%;
    margin: 0 5px;
    display: flex;
    flex-direction: column;
	progress[value] {
        width: 100%;
        appearance: none;
        height: 10px;
        border-radius: 20px;
        overflow: hidden;

		::-webkit-progress-bar {
            background-color: #4d525c;
		}

        ::-moz-progress-bar {
            background-color: #4d525c;
        }

        ::-webkit-progress-value {
			background-color: #65ff00;
		}
	}
`;


interface HomeOptionsLoaderProp {
    glftDataLoading: boolean;
    gltfFileDownloadProgress: number;
}


const HomeOptionsLoader: FC<HomeOptionsLoaderProp> = (
    { glftDataLoading, gltfFileDownloadProgress = 0 }
) => {
    return (
        <LoaderContainer>
            {
                glftDataLoading ?
                    <ProgressContainer>
                        <ProgressBarContainer>
                            <ProgressBar>
                                <ProgressLabel>Gltf file loading progress:</ProgressLabel>
                                <progress max={100} value={gltfFileDownloadProgress} />
                            </ProgressBar>
                            <ProgressPercentage>{gltfFileDownloadProgress}%</ProgressPercentage>
                        </ProgressBarContainer>
                    </ProgressContainer>
                    :
                    <StyledLoader type="Oval" color="#3274d9" secondaryColor="#235197" height={150} width={150} />

            }
        </LoaderContainer >
    );
};

export default HomeOptionsLoader;