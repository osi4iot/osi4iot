import { FC } from 'react'
import styled from "styled-components";

const DigitalTwinsContainer = styled.div`
    display: flex;
    justify-content: center;
    align-content: center;

`;

const DigitalTwins: FC<{}> = () => {
    return (
        <DigitalTwinsContainer>
            Digital twins
        </DigitalTwinsContainer>

    )
}

export default DigitalTwins;