import { FC, SyntheticEvent, ChangeEvent, useState } from "react";
import { useHistory, useLocation } from "react-router-dom";
import styled from "styled-components";
import Header from "../components/Layout/Header";
import Alert from "../components/Tools/Alert";
import { isValidPassword, isValidText } from "../tools/tools";
import Main from "../components/Layout/Main";
import { loginUser, useAuthState, useAuthDispatch } from "../contexts/authContext";
import ServerError from "../components/Tools/ServerError";
import { getUserRoleAndRedirect } from "../tools/userRole";
import { usePlatformAssitantDispatch } from "../contexts/platformAssistantContext";

const Title = styled.h2`
	font-size: 30px;
	margin-top: 30px;
	margin-bottom: 10px;
	font-weight: 400;
	text-align: center;
	color: white;
	width: 300px;
`;

const Form = styled.form`
	margin: 0 10px;
	color: white;
	margin: 20px 0;
	padding: 20px;
	width: 300px;
	border: 2px solid #3274d9;
	border-radius: 15px;
`;

const Label = styled.div`
	font-size: 14px;
	margin-bottom: 5px;
`;

interface InputProps {
	readonly isValidationRequired: boolean;
}

const Input = styled.input<InputProps>`
	background-color: #0b0c0e;
	padding: 8px 5px;
	font-size: 14px;
	margin-bottom: 20px;
	color: white;
	width: 100%;
	border-width: 1px;
	border-style: solid;
	border-color: ${(props) => {
		let color = "#2c3235";
		if (props.isValidationRequired) {
			if (props.type === "text" && !isValidText(props.value as string)) color = "#e02f44";
			if (props.type === "password" && !isValidPassword(props.value as string)) color = "#e02f44";
		}
		return color;
	}};
	outline: none;

	&:focus {
		box-shadow: rgb(20 22 25) 0px 0px 0px 2px, rgb(31 96 196) 0px 0px 0px 4px;
	}
`;

const SubmitContainer = styled.div`
	width: 100%;
	margin-top: 20px;
	display: flex;
	align-items: center;
	justify-content: center;
`;

const ItemContainer = styled.div`
	margin-top: 15px;
	width: 100%;
`;

const Submit = styled.input`
	width: 150px;
	background-color: #3274d9;
	padding: 8px;
	color: white;
	border: 1px solid #2c3235;
	border-radius: 10px;
	outline: none;
	cursor: pointer;
	box-shadow: 0 5px #173b70;
	margin-bottom: 15px;

	&:hover {
		background-color: #2461c0;
	}

	&:active {
		background-color: #2461c0;
		box-shadow: 0 2px #173b70;
		transform: translateY(4px);
	}
`;

const areLoginDataOK = ({ emailOrLogin, password }: { emailOrLogin: string; password: string }): boolean => {
	let areOK = true;
	if (emailOrLogin.trim() === "") areOK = false;
	if (!isValidPassword(password)) areOK = false;
	return areOK;
};

const initialFormValues = {
	userName: "",
	password: "",
};

const LoginPage: FC<{}> = () => {
	const [isValidationRequired, setIsValidationRequired] = useState(false);
	const [formValues, setFormValues] = useState(initialFormValues);
	const platformAssistantDispatch = usePlatformAssitantDispatch();
	const { userName, password } = formValues;

	const history = useHistory();
	const location = useLocation<any>();
	const previusObjectURL = location.state?.from;

	const authDispatch = useAuthDispatch();
	const { loading, errorMessage } = useAuthState();

	const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
		const changedFormValues = {
			...formValues,
			[e.target.name]: e.target.value,
		};
		setFormValues(changedFormValues);
	};

	const handleSubmit = async (e: SyntheticEvent) => {
		e.preventDefault();
		const loginData = {
			emailOrLogin: userName,
			password,
		};
		if (!areLoginDataOK(loginData)) {
			setIsValidationRequired(true);
		} else {
			try {
				let response = await loginUser(authDispatch, loginData);
				if (!response?.accessToken) return;
				if (previusObjectURL) history.push(previusObjectURL);
				else getUserRoleAndRedirect(response.accessToken, platformAssistantDispatch, history);
			} catch (error) {
				console.log(error);
			}
		}
	};

	return (
		<>
			<Header />
			<Main>
				<>
					<Title>Login</Title>
					{errorMessage  && <ServerError errorText={errorMessage} />}
					<Form onSubmit={handleSubmit}>
						<ItemContainer>
							<Label>Username:</Label>
							<Input
								type="text"
								name="userName"
								isValidationRequired={isValidationRequired}
								onChange={handleInputChange}
								value={userName}
								disabled={loading}
							/>
							{isValidationRequired && userName.trim() === "" && <Alert alertText="Username is required" />}
						</ItemContainer>

						<ItemContainer>
							<Label>Password:</Label>
							<Input
								type="password"
								name="password"
								isValidationRequired={isValidationRequired}
								onChange={handleInputChange}
								value={password}
								disabled={loading}
							/>
							{isValidationRequired && !isValidPassword(password) && (
								<Alert alertText="Password is required and must contain at least 4 characters" />
							)}
						</ItemContainer>

						<SubmitContainer>
							<Submit type="submit" value="SIGN IN" disabled={loading} />
						</SubmitContainer>
					</Form>
				</>
			</Main>
		</>
	);
};

export default LoginPage;
