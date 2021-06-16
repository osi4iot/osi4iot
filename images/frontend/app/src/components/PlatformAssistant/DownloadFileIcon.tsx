import { FC } from "react";
import { FaFileDownload } from "react-icons/fa";
import styled from "styled-components";

const FaFileDownloadStyled = styled(FaFileDownload)`
    font-size: 18px;
`;


interface FaFileDownloadProps {
    rowIndex: number
}

const FaFileDownloadWrapper = styled.div<FaFileDownloadProps>`
    ${FaFileDownloadStyled} {
        background-color:${(props) => (props.rowIndex % 2 === 0 ? '#0c0d0f' : '#202226')};
    }
`;

const IconContainer = styled.div<FaFileDownloadProps>`
	display: flex;
	justify-content: center;
	align-items: center;
    background-color:${(props) => (props.rowIndex % 2 === 0 ? '#0c0d0f' : '#202226')};

    &:hover {
        cursor: pointer;

		& ${FaFileDownloadStyled} {
			color: #3274d9;
		}
    }
`;

interface DownloadFileIconProps {
    rowIndex: number
}

const DownloadFileIcon: FC<DownloadFileIconProps> = ({ rowIndex }) => {

    return (
        <IconContainer rowIndex={rowIndex}>
            <FaFileDownloadWrapper rowIndex={rowIndex} >
                <FaFileDownloadStyled />
            </FaFileDownloadWrapper>
        </IconContainer>
    );
};

export default DownloadFileIcon;