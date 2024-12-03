import { FC } from 'react';
import styled from "styled-components";
import Spinner from "react-loader-spinner";


const PdfLoaderContainer = styled.div`
    margin-top: 75%;
	display: flex;
	justify-content: center;
    flex-direction: row;
	align-items: center;
	width: 100%;
	height: 100%;
`;

const StyledLoader = styled(Spinner)`
	background-color: #202226;
`

const PdfLoader: FC<{}> = () => {
    return (
        <PdfLoaderContainer>
            <StyledLoader type="Oval" color="#3274d9" secondaryColor="#235197" height={200} width={200} />
        </PdfLoaderContainer>
    );
};

export default PdfLoader;