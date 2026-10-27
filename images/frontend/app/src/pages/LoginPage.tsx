import { FC, SyntheticEvent, ChangeEvent, useState } from "react";
import { useNavigate, useLocation, Location } from "react-router";
import styled from "styled-components";
import { Eye, EyeOff } from "lucide-react";
import Header from "../components/Layout/Header";
import Alert from "../components/Tools/Alert";
import { isValidPassword, isValidText } from "../tools/tools";
import Main from "../components/Layout/Main";
import { loginUser, useAuthState, useAuthDispatch } from "../contexts/authContext";
import ServerError from "../components/Tools/ServerError";
import { getUserRoleAndRedirect } from "../tools/userRole";

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
	width: 250px;
	border: 2px solid #3274d9;
	border-radius: 15px;

	& > div:first-child {
		margin-top: 10px;
	}
`;

const Label = styled.div`
	font-size: 14px;
	margin-bottom: 5px;
`;

interface InputProps {
	readonly isValidationRequired: boolean;
	readonly $validateAs?: "text" | "password";
}

const Input = styled.input<InputProps>`
	background-color: #0b0c0e;
	padding: 8px 5px;
	font-size: 14px;
	color: white;
	width: 100%;
	border-width: 1px;
	border-style: solid;
	border-color: ${(props) => {
		let color = "#2c3235";
		if (props.isValidationRequired) {
			const validateAs = props.$validateAs ?? props.type;
			if (validateAs === "text" && !isValidText(props.value as string)) color = "#e02f44";
			if (validateAs === "password" && !isValidPassword(props.value as string)) color = "#e02f44";
		}
		return color;
	}};
	outline: none;

	&:focus {
		box-shadow: rgb(20 22 25) 0px 0px 0px 2px, rgb(31 96 196) 0px 0px 0px 4px;
	}
`;

const PasswordWrapper = styled.div`
	position: relative;
	width: 100%;

	& input {
		padding-right: 36px;
	}

	& input::-ms-reveal {
		display: none;
	}
`;

const TogglePasswordButton = styled.button`
	position: absolute;
	top: 50%;
	right: 6px;
	transform: translateY(-50%);
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 4px;
	background: none;
	border: none;
	color: #8e8e8e;
	cursor: pointer;
	outline: none;

	&:hover,
	&:focus-visible {
		color: white;
	}

	&:disabled {
		cursor: default;
		opacity: 0.5;
	}
`;

const SubmitContainer = styled.div`
	width: 100%;
	margin-top: 30px;
	display: flex;
	align-items: center;
	justify-content: center;
`;

const ItemContainer = styled.div`
	margin-top: 35px;
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
	const [showPassword, setShowPassword] = useState(false);
	const { userName, password } = formValues;

	const navigate = useNavigate();
	const location = useLocation();
	const previusObjectURL = (location.state as { from?: Location } | null)?.from;

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
				if (previusObjectURL) navigate(previusObjectURL);
				else getUserRoleAndRedirect(response.accessToken, navigate);
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
					{errorMessage && <ServerError errorText={errorMessage} />}
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
							<PasswordWrapper>
								<Input
									type={showPassword ? "text" : "password"}
									$validateAs="password"
									name="password"
									autoComplete="current-password"
									isValidationRequired={isValidationRequired}
									onChange={handleInputChange}
									value={password}
									disabled={loading}
								/>
								<TogglePasswordButton
									type="button"
									onClick={() => setShowPassword((show) => !show)}
									aria-label={showPassword ? "Hide password" : "Show password"}
									title={showPassword ? "Hide password" : "Show password"}
									disabled={loading}
								>
									{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
								</TogglePasswordButton>
							</PasswordWrapper>
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
