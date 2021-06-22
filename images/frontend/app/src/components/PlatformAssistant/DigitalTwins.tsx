import { FC } from 'react'
import styled from "styled-components";

const DigitalTwinsContainer = styled.div`
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    width: 100%;
    height: 100%;
`;

const DigitalTwins: FC<{}> = () => {
    return (
        <DigitalTwinsContainer>
            Digital twins
        </DigitalTwinsContainer>

    )
}

export default DigitalTwins;