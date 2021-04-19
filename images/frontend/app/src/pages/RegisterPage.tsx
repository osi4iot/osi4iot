import React, { FC, SyntheticEvent, ChangeEvent, useState, useEffect } from "react";
import {Redirect } from "react-router-dom";
import axios from "axios";
import styled from "styled-components";
import Header from "../components/Header";
import Alert from "../components/Alert";
import { getDomainName, isValidEmail, isValidPassword, isValidText } from "../tools/tools";
import ErrorPage from "./ErrorPage";
import Main from "../components/Main";


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
	if (userData.firstName.trim() === "") areOK = false;
	if (userData.surname.trim() === "") areOK = false;
	if (userData.login.trim() === "") areOK = false;
	if (!isValidEmail(userData.email)) areOK = false;
	if (!isValidPassword(userData.password)) areOK = false;

	return areOK;
};


const domainName = getDomainName();

const initialFormValues = {
	firstName: "",
	surname: "",
	login: "",
	email: "",
	password: "",
	telegramId: "",
};

const RegisterPage: FC<{}> = () => {
	const [isValidToken, setIsValidToken] = useState(true);
	const [isUserRegistered, setIsUserRegistered] = useState(false);
	const [isValidationRequired, setIsValidationRequired] = useState(false);
	const [formValues, setFormValues] = useState(initialFormValues);
	const { firstName, surname, login, email, password, telegramId } = formValues;

	useEffect(() => {
		const url = `https://${domainName}/admin_api/auth/user_data`;
		const token = getToken();
		if (token) {
			const config = axiosAuth(token as string);
			axios
				.get(url, config)
				.then((response) => {
					const changedFormValues = {
						...initialFormValues,
						firstName: response.data.firstName,
						surname: response.data.surname,
						email: response.data.email,
					};
					setFormValues(changedFormValues);
				})
				.catch((error) => {
					setIsValidToken(false);
					console.log(error.response);
				});
		} else setIsValidToken(false);
	}, []);

	const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
		const changedFormValues = {
			...formValues,
			[e.target.name]: e.target.value,
		};
		setFormValues(changedFormValues);
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

			const url = `https://${domainName}/admin_api/auth/register`;
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

	if (!isValidToken) {
		return <ErrorPage><span>&#x2718;&nbsp;&nbsp;Invalid Token</span></ErrorPage>
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
										name="firstName"
										isValidationRequired={isValidationRequired}
										onChange={handleInputChange}
										value={firstName}
									/>
									{isValidationRequired && firstName.trim() === "" && <Alert alertText="Firstname is required" />}
								</ItemContainer>

								<ItemContainer>
									<Label>Surname:</Label>
									<Input
										type="text"
										name="surname"
										isValidationRequired={isValidationRequired}
										onChange={handleInputChange}
										value={surname}
									/>
									{isValidationRequired && surname.trim() === "" && <Alert alertText="Surname is required" />}
								</ItemContainer>

								<ItemContainer>
									<Label>Username:</Label>
									<Input
										type="text"
										name="login"
										isValidationRequired={isValidationRequired}
										onChange={handleInputChange}
										value={login}
									/>
									{isValidationRequired && login.trim() === "" && <Alert alertText="Username is required" />}
								</ItemContainer>

								<ItemContainer>
									<Label>Email:</Label>
									<Input
										type="email"
										name="email"
										isValidationRequired={isValidationRequired}
										onChange={handleInputChange}
										value={email}
									/>
									{isValidationRequired && !isValidEmail(email) && <Alert alertText="Email is required" />}
								</ItemContainer>

								<ItemContainer>
									<Label>Password:</Label>
									<Input
										type="password"
										name="password"
										isValidationRequired={isValidationRequired}
										onChange={handleInputChange}
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
										name="telegramId"
										isValidationRequired={false}
										onChange={handleInputChange}
										value={telegramId}
									/>
								</ItemContainer>

								<SubmitContainer>
									<Submit type="submit" value="SUBMIT" />
								</SubmitContainer>
							</Form>
						</>
					) : (
						<Redirect to="/" />
					)}
				</Main>
			</>
		);
	}
};

export default RegisterPage;
