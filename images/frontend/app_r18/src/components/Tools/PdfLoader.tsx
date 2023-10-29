import { FC } from 'react';
import styled from "styled-components";
import { Oval } from "react-loader-spinner";


const PdfLoaderContainer = styled.div`
    margin-top: 75%;
	display: flex;
	justify-content: center;
    flex-direction: row;
	align-items: center;
	width: 100%;
	height: 100%;
`;

const StyledLoader = styled(Oval)`
	background-color: #202226;
`

const PdfLoader: FC<{}> = () => {
    return (
        <PdfLoaderContainer>
            <StyledLoader color="#3274d9" height={200} width={200} />
        </PdfLoaderContainer>
    );
};

export default PdfLoader;