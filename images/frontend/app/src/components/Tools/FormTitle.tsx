import { FC } from 'react';
import styled from "styled-components";
import MiniLoader from './MiniLoader';

const TitleContainer = styled.div`
	display: flex;
    flex-direction: row;
	justify-content: center;
	align-items: center;
	margin-top: 30px;
	margin-bottom: 10px;
`;


const Title = styled.div`
	font-weight: 400;
	color: white;
    font-size: 20px;
`;

interface FormTitleProp {
	isSubmitting?: boolean;
}

const FormTitle: FC<FormTitleProp> = ({ isSubmitting = false, children }) => {
	return (
		<TitleContainer>
			<Title>
				{children}
			</Title>
			{isSubmitting  && <MiniLoader />} 
		</TitleContainer>
	)
};

export default FormTitle;