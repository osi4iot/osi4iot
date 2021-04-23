import { FC, useEffect, useState } from "react";
import styled from "styled-components";
import { useAuthState } from "../context";

const ServerErrorContainer = styled.div`
	font-size: 14px;
	padding: 10px;
	font-weight: 500;
	color: #FFFFFF;
	background: #E02F44;
	border-radius: 2px;
`;

interface ServerErrorProp {
	errorText: string;
}

const ServerError: FC<ServerErrorProp> = ({ errorText }) => {
	const [showErrorMessage, setShowErrorMessage] = useState(false);
	const { errorMessage } = useAuthState();

	useEffect(() => {
		setShowErrorMessage(true);
		const errorInterval = setInterval(() => {
			setShowErrorMessage(false);
			clearInterval(errorInterval);
		}, 2000);
	}, [errorMessage]);

	return showErrorMessage ? <ServerErrorContainer>{errorText}</ServerErrorContainer> : null;
};

export default ServerError;
