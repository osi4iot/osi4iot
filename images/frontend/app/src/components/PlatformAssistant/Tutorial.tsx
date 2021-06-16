import { FC } from 'react'
import styled from "styled-components";

const TutorialContainer = styled.div`
    display: flex;
    justify-content: center;
    align-content: center;

`;

const Tutorial: FC<{}> = () => {
    return (
  
        <TutorialContainer>
            Tutorial
        </TutorialContainer>

    )
}

export default Tutorial;