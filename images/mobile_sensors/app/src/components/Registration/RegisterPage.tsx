import React, { FC, SyntheticEvent, ChangeEvent, useState, useEffect } from "react";
import axios from "axios";
import styled from "styled-components";
import Header from "./Header";
import Alert from "./Alert";
import SuccessModal from "./SuccesModal";
import ErrorMessage from "./ErrorMessage";

const Main = styled.main`
	color: white;
	display: flex;
	flex-direction: column;
	justify-content: center;
	align-items: center;
`;

const Title = styled.h2`
	font-size: 20px;
	margin-top: 10px;
	font-weight: 400;
	text-align: center;
	color: white;
	width: 300px;
`;

const Form = styled.form`
	margin: 0 10px;
	color: white;
	width: 300px;
`;

const Label = styled.div`
	font-size: 12px;
	margin-bottom: 5px;
`;

const isValidText = (text: string): boolean => {
	let isValid = true;
	if (text === "") isValid = false;
	return isValid;
};

const isValidEmail = (email: string): boolean => {
	let isValid = true;
	/* eslint-disable no-useless-escape */
	/* eslint-disable max-len */
	const EMAIL_REGEX = /^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;

	if (!EMAIL_REGEX.test(email)) {
		isValid = false;
	}
	return isValid;
};

const isValidPassword = (password: string): boolean => {
	let isValid = true;
	if (password === "" || password.length < 4) isValid = false;
	return isValid;
};

interface InputProps {
	readonly isValidationRequired: boolean;
}

const Input = styled.input<InputProps>`
	background-color: #0b0c0e;
	padding: 8px 5px;
	font-size: 14px;
	margin-bottom: 5px;
	color: white;
	width: 100%;
	border-width: 1px;
	border-style: solid;
	border-color: ${(props) => {
		let color = "#2c3235";
		if (props.isValidationRequired) {
			if (props.type === "text" && !isValidText(props.value as string)) color = "#e02f44";
			if (props.type === "password" && !isValidPassword(props.value as string)) color = "#e02f44";
			if (props.type === "email" && !isValidEmail(props.value as string)) color = "#e02f44";
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
	background-color: #3274D9;
	padding: 8px;
	color: white;
	border: 1px solid #2c3235;
	border-radius: 10px;
	outline: none;
	cursor: pointer;
	box-shadow: 0 5px #173B70;
	margin-bottom: 15px;

	&:hover {
		background-color: #2A6075;
	}

	&:active {
		background-color: #2A6075;
		box-shadow: 0 2px #173B70;
		transform: translateY(4px);
	}
`;

const getToken = () => {
	let token: string | null = null;
	var searchParams = new URLSearchParams(window.location.search);
	if (searchParams.has("token")) {
		token = searchParams.get("token");
	}
	return token;
};

const axiosAuth = (token: string) => {
	const config = {
		headers: {
			Authorization: "Bearer " + token,
		},
	};
	return config;
};

interface IUserRegistrationData {
	firstName: string;
	surname: string;
	login: string;
	email: string;
	password: string;
	telegramId: string;
}

const areRegisterDataOK = (userData: IUserRegistrationData): boolean => {
	let areOK = true;
	if (userData.firstName === "") areOK = false;
	if (userData.surname === "") areOK = false;
	if (userData.login === "") areOK = false;
	if (!isValidEmail(userData.email)) areOK = false;
	if (!isValidPassword(userData.password)) areOK = false;

	return areOK;
};

const LinksContainer = styled.div`
	display: flex;
	flex-direction: column;
	justify-content: space-around;
	align-items: center;
	width: 300px;
	height: 450px;
`;

const ButtonLink = styled.button`
	background-color: #3274D9;
	padding: 10px 20px;
	color: white;
	border: 1px solid #2c3235;
	border-radius: 10px;
	outline: none;
	cursor: pointer;
	box-shadow: 0 5px #173B70;
	width: 250px;

	&:hover {
		background-color: #2A6075;
	}

	&:active {
		background-color: #2A6075;
		box-shadow: 0 2px #173B70;
		transform: translateY(4px);
	}
`;

const RegisterPage: FC<{}> = () => {
	const [isValidToken, setIsValidToken] = useState(true);
	const [isUserRegistered, setIsUserRegistered] = useState(false);
	const [isValidationRequired, setIsValidationRequired] = useState(false);
	const [firstName, setFirstName] = useState("");
	const [surname, setSurname] = useState("");
	const [login, setLogin] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [telegramId, setTelegramId] = useState("");

	useEffect(() => {
		const url = `https://${window._env_.DOMAIN_NAME}/admin_api/auth/user_data`;
		const token = getToken();
		if (token) {
			const config = axiosAuth(token as string);
			axios
				.get(url, config)
				.then((response) => {
					setFirstName(response.data.firstName);
					setSurname(response.data.surname);
					setEmail(response.data.email);
					setIsValidToken(true);
				})
				.catch((error) => {
					setIsValidToken(false);
					console.log(error.response);
				});
		} else setIsValidToken(false);
	}, []);

	const handleFirstNameChange = (e: ChangeEvent<HTMLInputElement>) => {
		setFirstName(e.target.value);
	};

	const handleSurnameChange = (e: ChangeEvent<HTMLInputElement>) => {
		setSurname(e.target.value);
	};

	const handleLoginChange = (e: ChangeEvent<HTMLInputElement>) => {
		setLogin(e.target.value);
	};

	const handleEmailChange = (e: ChangeEvent<HTMLInputElement>) => {
		setEmail(e.target.value);
	};

	const handlePasswordChange = (e: ChangeEvent<HTMLInputElement>) => {
		setPassword(e.target.value);
	};

	const handleTelegramIdChange = (e: ChangeEvent<HTMLInputElement>) => {
		setTelegramId(e.target.value);
	};

	const handleSubmit = (e: SyntheticEvent) => {
		e.preventDefault();
		const registerData = {
			firstName,
			surname,
			login,
			email,
			password,
			telegramId,
		};
		if (!areRegisterDataOK(registerData)) {
			setIsValidationRequired(true);
		} else {
			const token = getToken();
			const config = axiosAuth(token as string);

			const url = `https://${window._env_.DOMAIN_NAME}/admin_api/auth/register`;
			axios
				.patch(url, registerData, config)
				.then((response) => {
					if (response.data.message === "User registered successfully") {
						setIsUserRegistered(true);
					} else console.log(response.data.message);
				})
				.catch((error) => console.log(error.response));
		}
	};

	const handleGrafanaLink = () => {
		window.location.href = `https://${window._env_.DOMAIN_NAME}`;
	};

	const handlePlatformAssistantLink = () => {
		window.location.href = `https://${window._env_.DOMAIN_NAME}/admin_api/swagger/`;
	};

	const handleMobileSensorsLink = () => {
		window.location.href = `https://${window._env_.DOMAIN_NAME}/mobile_sensors/`;
	};


	if (!isValidToken) {
		return (
			<>
				<Header />
				<Main>
					<ErrorMessage>&#x2718;&nbsp;&nbsp;Invalid Token</ErrorMessage>
				</Main>
			</>
		);
	} else {
		return (
			<>
				<Header />
				<Main>
					{!isUserRegistered ? (
						<>
							<Title>User registration</Title>
							<Form onSubmit={handleSubmit}>
								<ItemContainer>
									<Label>First name:</Label>
									<Input
										type="text"
										id="firstName"
										isValidationRequired={isValidationRequired}
										onChange={handleFirstNameChange}
										value={firstName}
									/>
									{isValidationRequired && firstName === "" && <Alert alertText="Firstname is required" />}
								</ItemContainer>

								<ItemContainer>
									<Label>Surname:</Label>
									<Input
										type="text"
										id="surname"
										isValidationRequired={isValidationRequired}
										onChange={handleSurnameChange}
										value={surname}
									/>
									{isValidationRequired && surname === "" && <Alert alertText="Surname is required" />}
								</ItemContainer>

								<ItemContainer>
									<Label>Username:</Label>
									<Input
										type="text"
										id="login"
										isValidationRequired={isValidationRequired}
										onChange={handleLoginChange}
										value={login}
									/>
									{isValidationRequired && login === "" && <Alert alertText="Username is required" />}
								</ItemContainer>

								<ItemContainer>
									<Label>Email:</Label>
									<Input
										type="email"
										id="email"
										isValidationRequired={isValidationRequired}
										onChange={handleEmailChange}
										value={email}
									/>
									{isValidationRequired && !isValidEmail(email) && <Alert alertText="Email is required" />}
								</ItemContainer>

								<ItemContainer>
									<Label>Password:</Label>
									<Input
										type="password"
										id="password"
										isValidationRequired={isValidationRequired}
										onChange={handlePasswordChange}
										value={password}
									/>
									{isValidationRequired && !isValidPassword(password) && (
										<Alert alertText="Password is required and must contain at least 4 characters" />
									)}
								</ItemContainer>

								<ItemContainer>
									<Label>TelegramId:</Label>
									<Input
										type="text"
										id="telegramId"
										isValidationRequired={false}
										onChange={handleTelegramIdChange}
										value={telegramId}
									/>
								</ItemContainer>

								<SubmitContainer className="row">
									<Submit type="submit" value="SUBMIT" />
								</SubmitContainer>
							</Form>
						</>
					) : (
						<LinksContainer>
							<SuccessModal>&#10004;&nbsp;&nbsp;User registered successfully</SuccessModal>
							<ButtonLink onClick={handleGrafanaLink}>Dashboards</ButtonLink>
							<ButtonLink onClick={handlePlatformAssistantLink}>Platform assistant</ButtonLink>
							<ButtonLink onClick={handleMobileSensorsLink}>Mobile sensors<br /> (Only Android devices)</ButtonLink>
						</LinksContainer>
					)}
				</Main>
			</>
		);
	}
};

export default RegisterPage;