import { FC } from 'react'
import styled from "styled-components";

const TutorialContainer = styled.div`
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    width: 100%;
    height: 100%;
`;

const Tutorial: FC<{}> = () => {
    return (

        <TutorialContainer>
            Tutorial
        </TutorialContainer>

    )
}

export default Tutorial;