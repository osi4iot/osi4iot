import { FC, SyntheticEvent, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import styled from "styled-components";
import * as Yup from 'yup';
import Header from "../components/Layout/Header";
import { axiosAuth, getDomainName, getProtocol } from "../tools/tools";
import ErrorPage from "./ErrorPage";
import Main from "../components/Layout/Main";
import { toast } from "react-toastify";
import FormTitle from "../components/Tools/FormTitle";
import { Form, Formik } from "formik";
import FormikControl from "../components/Tools/FormikControl";
import FormButtons from "../components/Tools/FormButtons";

const FormContainer = styled.div`
	font-size: 12px;
    padding: 20px;
    border: 3px solid #3274d9;
    border-radius: 20px;
    width: 300px;
	background-color: #202226;
	margin-bottom: 20px;

    form > div:nth-child(2) {
        margin-right: 10px;
    }
`;

const ControlsContainer = styled.div`
    width: 100%;
    padding: 0px 5px;
    div:first-child {
        margin-top: 0;
    }

    div:last-child {
        margin-bottom: 3px;
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


const domainName = getDomainName();
const protocol = getProtocol();

const initialFormValues = {
	firstName: "",
	surname: "",
	login: "",
	email: "",
	password: ""
};

const RegisterPage: FC<{}> = () => {
	const [isValidToken, setIsValidToken] = useState(true);
	const [initialRegistrationValues, setInitialRegistrationValues] = useState(initialFormValues);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const navigate = useNavigate();

	const onSubmit = (values: any, actions: any) => {
		const url = `${protocol}://${domainName}/admin_api/auth/register`;
		const token = getToken();
		const config = axiosAuth(token as string);

		setIsSubmitting(true);
		axios
			.patch(url, values, config)
			.then((response) => {
				setIsSubmitting(false);
				const data = response.data;
				toast.success(data.message);
				if (data.message === "User registered successfully") {
					navigate("/");
				}
			})
			.catch((error) => {
				const errorMessage = error.response.data.message;
				if(errorMessage !== "jwt expired") toast.error(errorMessage);
			})
	}


	useEffect(() => {
		const url = `${protocol}://${domainName}/admin_api/auth/user_data_for_register`;
		const token = getToken();
		if (token) {
			const config = axiosAuth(token as string);
			axios
				.get(url, config)
				.then((response) => {
					const data = response.data;
					const changedFormValues = {
						...initialFormValues,
						firstName: data.firstName,
						surname: data.surname,
						email: data.email,
					};
					setInitialRegistrationValues(changedFormValues);
				})
				.catch((error) => {
					setIsValidToken(false);
					console.log(error.response);
				});
		} else setIsValidToken(false);
	}, []);

	const validationSchema = Yup.object().shape({
		firstName: Yup.string().required('Required'),
		surname: Yup.string().required('Required'),
		login: Yup.string().required('Required'),
		email: Yup.string().email().required('Required'),
		password: Yup.string().min(4, "At least 4 characters are required").required('Required'),
	});

	const onCancel = (e: SyntheticEvent) => {
		e.preventDefault();
		navigate("/");
	};

	if (!isValidToken) {
		return <ErrorPage><span>&#x2718;&nbsp;&nbsp;Invalid Token</span></ErrorPage>
	} else {
		return (
			<>
				<Header />
				<Main>
					<>
						<FormTitle isSubmitting={isSubmitting}>User registration</FormTitle>
						<FormContainer>
							<Formik
								enableReinitialize
								initialValues={initialRegistrationValues}
								validationSchema={validationSchema}
								onSubmit={onSubmit}
							>
								{
									formik => (
										<Form>
											<ControlsContainer>
												<FormikControl
													control='input'
													label='First name'
													name='firstName'
													type='text'
												/>
												<FormikControl
													control='input'
													label='Surname'
													name='surname'
													type='text'
												/>
												<FormikControl
													control='input'
													label='Username'
													name='login'
													type='text'
												/>
												<FormikControl
													control='input'
													label='Email'
													name='email'
													type='email'
												/>
												<FormikControl
													control='input'
													label='Password'
													name='password'
													type='password'
												/>
											</ControlsContainer>
											<FormButtons
												onCancel={onCancel}
												isValid={formik.isValid}
												isSubmitting={formik.isSubmitting}
											/>
										</Form>
									)
								}
							</Formik>
						</FormContainer>
					</>
				</Main>
			</>
		);
	}
};

export default RegisterPage;
