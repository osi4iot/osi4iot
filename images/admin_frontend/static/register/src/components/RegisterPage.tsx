import React, { FC, SyntheticEvent, ChangeEvent, useState, useEffect } from "react";
import axios from "axios";
import styled from "styled-components";
import Header from "./Header";

const Main = styled.main`
	color: white;
	display: flex;
	flex-direction: column;
	justify-content: center;
	align-items: center;
`;

const Title = styled.h2`
	font-size: 20px;
	margin: 20px 0;
	font-weight: 400;
	text-align: center;
	color: white;
	width: 300px;
`;

const Form = styled.form`
	margin: 10px;
	color: white;
	width: 300px;
`;

const Label = styled.div`
	font-size: 12px;
`;

const Input = styled.input`
	background-color: #0b0c0e;
	font-size: 14px;
	margin-top: 2px;
	margin-bottom: 20px;
	color: white;
	width: 100%;
	border: 1px solid #2c3235;
`;

const SubmitContainer = styled.div`
	width: 100%;
	margin-top: 30px;
	display: flex;
	align-items: center;
	justify-content: center;
`;

const Submit = styled.input`
	width: 150px;
	background-color: rgb(50, 116, 217);
	padding: 5px;
	color: white;
	border: 1px solid #2c3235;
	border-radius: 10px;
`;

const handleSubmit = (e: SyntheticEvent) => {
	e.preventDefault();
	console.log("Hello");
};

// interface IUserData {
// 	firstName: string;
// 	surname: string;
// 	login: string;
// 	email: string;
// 	password: string;
// 	telegramId: string;
// }

const RegisterPage: FC<{}> = () => {
	const [firstName, setFirstName] = useState("");
	const [surname, setSurname] = useState("");
	const [login, setLogin] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [telegramId, setTelegramId] = useState("");

	useEffect(() => {
		const url = `https://${window._env_.DOMAIN_NAME}/admin_api/auth/user_data`;
		var searchParams = new URLSearchParams(window.location.search);
		if (searchParams.has("token")) {
			const token = searchParams.get("token");
			const config = {
				headers: {
				  'Authorization': 'Bearer ' + token
				}
			  }
			axios
				.get(url, config)
				.then((response) => {
					setFirstName(response.data.firstName);
					setSurname(response.data.surname);
					setEmail(response.data.email);
				})
				.catch((error: Error) => console.log(error));
		}

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

	return (
		<>
			<Header />
			<Main>
				<Title>User registration</Title>
				<Form onSubmit={handleSubmit}>
					<Label>First name:</Label>
					<Input type="text" id="firstName" onChange={handleFirstNameChange} value={firstName} />
					<Label>Surname:</Label>
					<Input type="text" id="surname" onChange={handleSurnameChange} value={surname} />
					<Label>Login:</Label>
					<Input type="text" id="login" onChange={handleLoginChange} value={login} />
					<Label>Email:</Label>
					<Input type="email" id="email" onChange={handleEmailChange} value={email} />
					<Label>Password:</Label>
					<Input type="password" id="password" onChange={handlePasswordChange} value={password} />
					<Label>TelegramId:</Label>
					<Input type="text" id="telegramId" onChange={handleTelegramIdChange} value={telegramId} />
					<SubmitContainer className="row">
						<Submit type="submit" value="SUBMIT" />
					</SubmitContainer>
				</Form>
			</Main>
		</>
	);
};

export default RegisterPage;
