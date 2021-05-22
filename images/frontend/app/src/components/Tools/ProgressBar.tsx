import { FC } from "react";
import styled from "styled-components";

const ProgressBarContainer = styled.div`
    margin-top: 10px;
	progress[value] {
		width: 100%;
		appearance: none;

		::-webkit-progress-bar {
            background-color: #4d525c;
			height: 10px;
			border-radius: 20px;

		}

        ::-webkit-progress-value {
			background-color: #65ff00;
			height: 10px;
			border-radius: 20px;
		}
	}
`;

interface ProgresBarProps {
	value: number;
}

const ProgresBar: FC<ProgresBarProps> = ({ value }) => {
	return (
		<ProgressBarContainer>
			<progress max={100} value={value} />
		</ProgressBarContainer>
	);
};

export default ProgresBar;
