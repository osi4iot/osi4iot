import { useWindowWidth } from '@react-hook/window-size';
import { FC } from 'react';
import styled from "styled-components";
import MiniLoader from './MiniLoader';

interface TitleContainerProps {
	isMobile: boolean;
}

const TitleContainer = styled.div.withConfig({
	shouldForwardProp: (prop) => prop !== 'isMobile'
  })<TitleContainerProps>`
	display: flex;
    flex-direction: row;
	justify-content: center;
	align-items: center;
	margin-top: ${(props) => (props.isMobile ? '10px' : '30px')};
	margin-bottom: 10px;
`;


const Title = styled.div`
	font-weight: 400;
	color: white;
    font-size: 20px;
`;

interface FormTitleProp {
	isSubmitting?: boolean;
	children: any;
}

const FormTitle: FC<FormTitleProp> = ({ isSubmitting = false, children }) => {
	const windowWidth = useWindowWidth();
	const isMobile = windowWidth < 768;
	return (
		<TitleContainer isMobile={isMobile}>
			<Title>
				{children}
			</Title>
			{isSubmitting  && <MiniLoader />} 
		</TitleContainer>
	)
};

export default FormTitle;