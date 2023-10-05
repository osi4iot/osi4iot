import { Router, NextFunction, Request, Response } from "express";
import passport from "passport";
import jwt from "jsonwebtoken";
import HttpException from "../../exceptions/HttpException";
import IController from "../../interfaces/controller.interface";
import validationMiddleware from "../../middleware/validation.middleware";
import LoginDto from "./login.dto";
import CreateChangePasswordDto from "./changePassword.dto";
import IRequestWithUser from "../../interfaces/requestWithUser.interface";
import passportInitialize from "../../config/passportHandler";
import { userAuth, registerAuth, superAdminAuth } from "../../middleware/auth.middleware";
import grafanaApi from '../../GrafanaApi';
import UserRegisterDto from "./userRegister.dto";
import { getUserdByEmailOrLogin, getUserLoginDatadByEmailOrLogin, isThisUserOrgAdmin, isUserProfileDataCorrect, updateOrganizationUser, updateUserProfileById } from "../user/userDAL";
import IUser from "../user/interfaces/User.interface";
import RefreshTokenToDisableDto from "./refreshTokenToDisableDTO";
import { deleteRefreshToken, deleteRefreshTokenById, deleteUserRefreshTokens, exitsRefreshToken, getAllRefreshTokens, getRefreshTokenByUserId, insertRefreshToken, updateRefreshToken } from "./authenticationDAL";
import { getNumOrganizations, getOrganizationsManagedByUserId } from "../organization/organizationDAL";
import { getAllGroupsInOrgArray, getFullGroupDataById, getGroupsManagedByUserId, getNumGroups, isThisUserGroupAdmin } from "../group/groupDAL";
import IComponentsManagedByUser from "./ComponentsManagedByUser.interface";
import generateLastSeenAtAgeString from "../../utils/helpers/generateLastSeenAtAgeString";
import CreateUserDto from "../user/interfaces/User.dto";
import UserProfileDto from "../user/interfaces/UserProfile.dto";
import verifiyPassword from "../../utils/helpers/verifiyPassword";
import process_env from "../../config/api_config";
import { getTopicInfoForMqttAclByTopicUid } from "../topic/topicDAL";
import ITopicInfoForMqttAcl from "../topic/topicInfoForMqttAcl.interface";
import { getNodeRedInstanceByProp } from "../nodeRedInstance/nodeRedInstanceDAL";
import { getNumAssets, getNumAssetsByGroupsIdArray } from "../asset/assetDAL";
import { getNumSensors, getNumSensorsByGroupsIdArray } from "../sensor/sensorDAL";
import { getNumDigitalTwins, getNumDigitalTwinsByGroupsIdArray } from "../digitalTwin/digitalTwinDAL";
import { getNumMLModelsByGroupsIdArray } from "../ml_model/ml_modelDAL";
import infoLogger from "../../utils/logger/infoLogger";
import errorLogger from "../../utils/logger/errorLogger";

interface IJwtPayload {
	id: string;
	email: string;
	action: string;
	iat: number;
	exp: number;
}

interface ILoginOutput {
	userName: string;
	accessToken: string;
	refreshToken: string;
	expirationDate: string;
}

class AuthenticationController implements IController {
	public path = "/auth";

	public router = Router();

	private grafanaRepository = grafanaApi;

	constructor() {
		this.initializeRoutes();
	}

	private initializeRoutes(): void {
		passportInitialize();
		this.router.post(`${this.path}/login`, validationMiddleware<LoginDto>(LoginDto), this.userLogin);
		this.router.patch(`${this.path}/register`, registerAuth, validationMiddleware<UserRegisterDto>(UserRegisterDto), this.userRegister);
		this.router.get(`${this.path}/user_data_for_register`, registerAuth, this.getUserRegisterData);
		this.router.get(`${this.path}/user_profile`, userAuth, this.getUserProfile);
		this.router.patch(`${this.path}/user_profile`, userAuth, validationMiddleware<UserProfileDto>(UserProfileDto), this.updateUserProfile);
		this.router.patch(
			`${this.path}/change_password`,
			userAuth,
			validationMiddleware<CreateChangePasswordDto>(CreateChangePasswordDto),
			this.changePassword
		);

		this.router.get(`${this.path}/refresh_tokens/`, superAdminAuth, this.getRefreshTokens);
		this.router.post(`${this.path}/update_token/`, this.refreshToken);
		this.router.delete(`${this.path}/disable_refresh_token/`, superAdminAuth, validationMiddleware<RefreshTokenToDisableDto>(RefreshTokenToDisableDto), this.disableRefreshToken);
		this.router.delete(`${this.path}/disable_refresh_token_by_id/:refreshTokenId`, superAdminAuth, this.disableRefreshTokenById);
		this.router.delete(`${this.path}/disable_user_refresh_tokens/:userId`, superAdminAuth, this.disableUsersRefreshToken);
		this.router.get(`${this.path}/user_managed_components`, userAuth, this.numComponentsManagedByUser);
		this.router.post(`${this.path}/mosquitto_user`, this.userMosquittoAuth);
		this.router.post(`${this.path}/mosquitto_aclcheck`, this.userMosquittoAclCheck);
	}

	private generateNewRefreshToken = (user: IUser) => {
		const payloadRefreshToken = {
			id: user.id,
			email: user.email,
			action: "refresh_token"
		};

		const algorithm = 'HS256' as jwt.Algorithm;
		const refreshToken = jwt.sign({ ...payloadRefreshToken }, process_env.REFRESH_TOKEN_SECRET, {
			algorithm,
			expiresIn: parseInt(process_env.REFRESH_TOKEN_LIFETIME, 10)
		});

		return refreshToken;

	}

	private generateLoginOutput = async (user: IUser): Promise<ILoginOutput> => {
		const payloadAccessToken = {
			id: user.id,
			email: user.email,
			action: "access"
		};

		const algorithm = "HS256" as jwt.Algorithm;
		const accessToken = jwt.sign({ ...payloadAccessToken }, process_env.ACCESS_TOKEN_SECRET, {
			algorithm,
			expiresIn: parseInt(process_env.ACCESS_TOKEN_LIFETIME, 10)
		});
		const decodedAccessToken = jwt.decode(accessToken) as IJwtPayload;
		const expirationDate = (new Date(decodedAccessToken.exp * 1000)).toString();

		const existentRefreshToken = await getRefreshTokenByUserId(user.id);
		let refreshToken;
		if (existentRefreshToken) {
			const decodedRefreshToken = jwt.decode(existentRefreshToken.token) as IJwtPayload;
			const refreshTokenExpirationDate = new Date(decodedRefreshToken.exp * 1000);
			const timeframe = parseInt(process_env.REFRESH_TOKEN_LIFETIME, 10) * 0.1;
			const accessTokenLifeTime = parseInt(process_env.ACCESS_TOKEN_LIFETIME, 10);
			const nextRefreshDate = new Date(Date.now() + (accessTokenLifeTime - timeframe) * 1000);
			refreshToken = existentRefreshToken.token;
			if (refreshTokenExpirationDate > nextRefreshDate) refreshToken = existentRefreshToken.token;
			else {
				refreshToken = this.generateNewRefreshToken(user);
				await updateRefreshToken(existentRefreshToken.token, refreshToken);
			}
		} else {
			refreshToken = this.generateNewRefreshToken(user);
			await insertRefreshToken(user.id, refreshToken);
		}

		const loginOutput: ILoginOutput = {
			userName: user.login,
			accessToken,
			refreshToken,
			expirationDate
		};

		return loginOutput;
	}

	private userLogin = (req: Request, res: Response, next: NextFunction): void => {
		passport.authenticate(
			"local-login",
			{ session: false },
			async (err: any, user: any): Promise<Response | void> => {
				if (err || !user) {
					const errorMessage = "User credentials not correct.";
					return next(new HttpException(req, res, 400, errorMessage));
				}

				try {
					const loginOutput = await this.generateLoginOutput(user);
					const message = `User with username=${loginOutput.userName} has been logged in successfully.`
					infoLogger(req, res, 200, message);
					return res.status(200).json(loginOutput);
				} catch (error) {
					return next(error);
				}
			}
		)(req, res);
	};

	private userMosquittoAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
		try {
			const { password, username } = req.body;
			const usernameArray = username.split("_");
			if (usernameArray[0] === "jwt") {
				const algorithm = "HS256" as jwt.Algorithm;
				const verifyOptionsAccessToken = {
					algorithms: [algorithm]
				};

				try {
					const jwtPayload = jwt.verify(
						password,
						process_env.ACCESS_TOKEN_SECRET,
						verifyOptionsAccessToken) as IJwtPayload;
					const user = await getUserdByEmailOrLogin(jwtPayload.email);
					if (!user || jwtPayload.action !== "access") {
						const errorMessage = "User not registered";
						errorLogger(req, res, 400, errorMessage)
						res.status(400).json({ Ok: false, Error: errorMessage });
						return
					}
					if (user.login !== username.slice(4)) {
						const errorMessage = "Username not match with jwt payload";
						errorLogger(req, res, 400, errorMessage)
						res.status(400).json({ Ok: false, Error: errorMessage });
						return
					}
				} catch (e) {
					if (e instanceof jwt.JsonWebTokenError) {
						const errorMessage = "JWT provided is unauthorized";
						errorLogger(req, res, 400, errorMessage)
						res.status(401).json({ Ok: false, Error: errorMessage });
						return
					}
					res.status(400).json({ Ok: false, Error: "Bad request" });
					return;
				}
			} else if (usernameArray[0] === "group") {
				const groupId = parseInt(usernameArray[1], 10);
				const group = await getFullGroupDataById(groupId);
				if (!group) {
					const errorMessage = "Group not registered";
					errorLogger(req, res, 400, errorMessage)
					res.status(400).json({ Ok: false, Error: errorMessage });
					return
				}
				const match = verifiyPassword(password, group.mqttPassword, group.mqttSalt);
				if (!match) {
					const errorMessage = `Password not correct for username= ${username as string}`;
					errorLogger(req, res, 400, errorMessage);
					res.status(400).json({ Ok: false, Error: errorMessage });
					return
				}
			} else {
				const user = await getUserLoginDatadByEmailOrLogin(username);
				if (!user) {
					const errorMessage = "User not registered";
					errorLogger(req, res, 400, errorMessage);
					res.status(400).json({ Ok: false, Error: errorMessage });
					return
				}
				const match = verifiyPassword(password, user.password, user.salt);
				if (!match) {
					const errorMessage = `Password not correct for username= ${username as string}`;
					errorLogger(req, res, 400, errorMessage);
					res.status(400).json({ Ok: false, Error: errorMessage });
					return
				}
			}

			const message = `A user with username=${username as string} has been connected successfully to the MQTT broker.`
			infoLogger(req, res, 200, message);
			res.status(200).json({ Ok: true, Error: "" });
		} catch (error) {
			return next(error);
		}
	};

	private userMosquittoAclCheck = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
		try {
			const { acc, username, topic } = req.body;
			const topicArray = topic.split("/");
			if (username === "dev2pdb") {
				const topicType = topicArray[0];
				if (
					!(
						topicType === "dev2pdb" ||
						topicType === "dev2pdb_wt" ||
						topicType === "dev2pdb_ma" ||
						topicType === "dev2dtm" ||
						topicType === "dev2sim" ||
						topicType === "dtm2dev" ||
						topicType === "dtm2sim" ||
						topicType === "dtm2pdb" ||
						topicType === "sim2dtm"
					)) {
					const errorMessage = "Topic type not allowed for dev2pdb";
					errorLogger(req, res, 400, errorMessage);
					res.status(400).json({ Ok: false, Error: errorMessage });
					return;
				} else {
					res.status(200).json({ Ok: true, Error: "" });
					return;
				}
			}

			if (username.split("_")[0] === "nri" && topicArray[0] === "test") {
				const nriHashInTopic = topicArray[1].slice(4);
				const nriHashInUserName = username.split("_")[1];
				if (nriHashInTopic !== nriHashInUserName) {
					const errorMessage = "Incorrect nri_hash";
					errorLogger(req, res, 400, errorMessage);
					res.status(400).json({ Ok: false, Error: errorMessage });
					return
				}
			}

			let isMosquittoSysTopic = false;
			if (topicArray[0] === "$SYS" && topicArray[1] === "broker") {
				isMosquittoSysTopic = true;
			}


			let topicData: ITopicInfoForMqttAcl;
			if (!isMosquittoSysTopic && topicArray.length === 4) {
				const topicUid = topicArray[3].slice(6);
				topicData = await getTopicInfoForMqttAclByTopicUid(topicUid);
				if (!topicData) {
					const errorMessage = "Incorrect topic hash";
					errorLogger(req, res, 400, errorMessage);
					res.status(400).json({ Ok: false, Error: errorMessage });
					return
				}

				const groupHash = topicArray[1].slice(6);
				if (groupHash !== topicData.groupHash) {
					const errorMessage = "Incorrect group hash";
					errorLogger(req, res, 400, errorMessage);
					res.status(400).json({ Ok: false, Error: errorMessage });
					return
				}

				const topicType = topicArray[0];
				if (topicType !== topicData.topicType) {
					const errorMessage = "Incorrect topic type";
					errorLogger(req, res, 400, errorMessage);
					res.status(400).json({ Ok: false, Error: errorMessage });
					return
				}

				if (topicData.topicAccessControl === "None") {
					const errorMessage = `It is not allowed any action for the topic with id: ${topicData.topicId}`;
					errorLogger(req, res, 400, errorMessage);
					res.status(400).json({ Ok: false, Error: errorMessage });
					return
				}

				if (topicData.groupAccessControl === "None") {
					const errorMessage = `It is not allowed any action for the group with id: ${topicData.groupId}`;
					errorLogger(req, res, 400, errorMessage);
					res.status(400).json({ Ok: false, Error: errorMessage });
					return
				}

				if (topicData.orgAccessControl === "None") {
					const errorMessage = `It is not allowed any action for the group with id: ${topicData.orgId}`;
					errorLogger(req, res, 400, errorMessage);
					res.status(400).json({ Ok: false, Error: errorMessage });
					return
				}

				if ((acc === 1 || acc === 4) && !(topicData.topicAccessControl === "Sub" || topicData.topicAccessControl === "Pub & Sub")) {
					const errorMessage = `Subcription/read action not allowed for the topic with id: ${topicData.topicId}`;
					errorLogger(req, res, 400, errorMessage);
					res.status(400).json({ Ok: false, Error: errorMessage });
					return
				}

				if ((acc === 2 || acc === 3) && !(topicData.topicAccessControl === "Pub" || topicData.topicAccessControl === "Pub & Sub")) {
					const errorMessage = `Publication/write action not allowed for the topic with id: ${topicData.topicId}`;
					errorLogger(req, res, 400, errorMessage);
					res.status(400).json({ Ok: false, Error: errorMessage });
					return
				}


				if ((acc === 1 || acc === 4) && !(topicData.groupAccessControl === "Sub" || topicData.groupAccessControl === "Pub & Sub")) {
					const errorMessage = `Subcription/read action not allowed for the group with id: ${topicData.groupId}`;
					errorLogger(req, res, 400, errorMessage);
					res.status(400).json({ Ok: false, Error: errorMessage });
					return
				}


				if ((acc === 2 || acc === 3) && !(topicData.groupAccessControl === "Pub" || topicData.groupAccessControl === "Pub & Sub")) {
					const errorMessage = `Publication/write action not allowed for the group with id: ${topicData.groupId}`;
					errorLogger(req, res, 400, errorMessage);
					res.status(400).json({ Ok: false, Error: errorMessage });
					return
				}

				if ((acc === 1 || acc === 4) && !(topicData.orgAccessControl === "Sub" || topicData.orgAccessControl === "Pub & Sub")) {
					const errorMessage = `Subcription/read action not allowed for the org with id: ${topicData.orgId}`;
					errorLogger(req, res, 400, errorMessage);
					res.status(400).json({ Ok: false, Error: errorMessage });
					return
				}


				if ((acc === 2 || acc === 3) && !(topicData.orgAccessControl === "Pub" || topicData.orgAccessControl === "Pub & Sub")) {
					const errorMessage = `Publication/write action not allowed for the org with id: ${topicData.orgId}`;
					errorLogger(req, res, 400, errorMessage);
					res.status(400).json({ Ok: false, Error: errorMessage });
					return
				}
			}

			const usernameArray = username.split("_");
			if (usernameArray[0] === "group") {
				const groupId = parseInt(usernameArray[1], 10);
				if (groupId !== topicData.groupId) {
					const errorMessage = "Group not registered";
					errorLogger(req, res, 400, errorMessage);
					res.status(400).json({ Ok: false, Error: errorMessage });
					return
				}
			} else if (usernameArray[0] === "nri") {
				if (topicArray[0] !== "test") {
					const nriHashInUserName = username.split("_")[1];
					const nodeRedInstance = await getNodeRedInstanceByProp("nri_hash", nriHashInUserName);
					if (nodeRedInstance.groupId !== topicData.groupId) {
						const errorMessage = "Incorrect group for provided nri_hash";
						errorLogger(req, res, 400, errorMessage);
						res.status(400).json({ Ok: false, Error: errorMessage });
						return
					}
				}
			} else {
				let user: IUser;
				if (usernameArray[0] === "jwt") {
					const login = username.slice(4);
					user = await getUserdByEmailOrLogin(login);
				} else {
					user = await getUserdByEmailOrLogin(username);
				}

				if (!user.isGrafanaAdmin && !isMosquittoSysTopic) {
					const orgId = topicData.orgId;
					const isOrgAdminUser = await isThisUserOrgAdmin(user.id, orgId);
					if (!isOrgAdminUser) {
						const teamId = topicData.teamId;
						const isGroupAdminUser = await isThisUserGroupAdmin(user.id, teamId);
						if (!isGroupAdminUser) {
							const errorMessage = `The username=${username as string} is not allowed to connect to the MQTT broker`;
							errorLogger(req, res, 400, errorMessage);
							res.status(401).json({ Ok: false, Error: errorMessage })
							return;
						}
					}
				}
			}

			res.status(200).json({ Ok: true, Error: "" });
		} catch (error) {
			return next(error);
		}
	};


	private userRegister = async (req: IRequestWithUser, res: Response, next: NextFunction): Promise<void> => {
		try {
			const { user } = req;
			const registerDto: UserRegisterDto = req.body;
			if (user.email !== registerDto.email) {
				const errorMessage = "The email indicated not match with the user email in database";
				throw new HttpException(req, res, 400, errorMessage);
			}
			registerDto.userId = user.id;
			const { message } = await this.grafanaRepository.changeUserPassword(user.id, registerDto.password);
			await updateOrganizationUser(registerDto);

			if (message !== "User password updated") {
				const errorMessage = "The password could not be updated";
				throw new HttpException(req, res, 400, errorMessage);
			} else {
				const okMessage = `A user with username: ${registerDto.login} has been registered successfully`;
				infoLogger(req, res, 200, okMessage);
				res.status(200).json({ message: okMessage });
			}
		} catch (error) {
			return next(error);
		}

	};

	private getUserRegisterData = (req: IRequestWithUser, res: Response, next: NextFunction) => {
		try {
			const { user } = req;
			const userData = {
				firstName: user.firstName,
				surname: user.surname,
				email: user.email
			}
			res.status(200).json(userData);
		} catch (error) {
			return next(error);
		}
	};

	private getUserProfile = (req: IRequestWithUser, res: Response, next: NextFunction) => {
		try {
			const { user } = req;
			const userData = {
				userId: user.id,
				firstName: user.firstName,
				surname: user.surname,
				email: user.email,
				login: user.login
			}
			res.status(200).json(userData);
		} catch (error) {
			return next(error);
		}
	};

	private updateUserProfile = async (req: IRequestWithUser, res: Response, next: NextFunction): Promise<void> => {
		try {
			const { user } = req;
			const userData: UserProfileDto = req.body;
			userData.id = userData.userId;
			if (!(
				user.id === userData.id &&
				user.firstName === userData.firstName &&
				user.surname === userData.surname &&
				user.email === userData.email &&
				user.login === userData.login
			)) {
				const isUpdateUserDataCorrect = await isUserProfileDataCorrect(userData);
				if (!isUpdateUserDataCorrect)
					throw new HttpException(req, res, 400, "The entered values of name, login and email already exists for another user.")
				await updateUserProfileById(userData as CreateUserDto);
			}
			const message = { message: `User profile with username: ${user.login} updated succesfully` };
			infoLogger(req, res, 200, message.message);
			res.status(200).json(message);
		} catch (error) {
			return next(error);
		}
	};

	private changePassword = async (req: IRequestWithUser, res: Response, next: NextFunction): Promise<void> => {
		try {
			const { user } = req;
			if (user.isGrafanaAdmin) {
				throw new HttpException(req, res, 403, "Platform admin password can not be modified.")
			}
			const { oldPassword, newPassword } = req.body;
			const { email } = user;
			const storedUserData = await getUserLoginDatadByEmailOrLogin(email);
			const match = verifiyPassword(oldPassword, storedUserData.password, storedUserData.salt);
			if (!match) {
				const errorMessage = "The entred value for old password is not correct.";
				throw new HttpException(req, res, 403, errorMessage);
			}
			const { message } = await this.grafanaRepository.changeUserPassword(user.id, newPassword);
			if (message !== "User password updated") {
				const errorMessage = `The password of user with email: ${email} could not be modified`;
				throw new HttpException(req, res, 403, errorMessage);
			} else {
				const okMessage = `Password of username: ${user.login} modified successfully`;
				infoLogger(req, res, 200, okMessage);
				res.status(200).json({ message: okMessage });
			}
		} catch (error) {
			return next(error);
		}

	};

	private refreshToken = (req: Request, res: Response, next: NextFunction): void => {
		passport.authenticate(
			"refresh_jwt",
			{ session: false },
			async (err: any, user: any, info: any): Promise<Response | void> => {
				if (info) {
					return next(new HttpException(req, res, 401, info.message));
				}

				if (err) {
					return next(err);
				}

				if (!user) {
					return next(new HttpException(req, res, 401, "You are not allowed to access."));
				}

				try {
					const oldRefreshToken: string = req.headers.authorization.slice(7);
					const isRefreshTokenCorrect = await exitsRefreshToken(oldRefreshToken);
					if (!isRefreshTokenCorrect) {
						return next(new HttpException(req, res, 404, "The refresh token supplied does not exist"));
					}
					const loginOutput = await this.generateLoginOutput(user);
					const message = `The access token for username=${loginOutput.userName} has been updated.`
					infoLogger(req, res, 200, message);
					return res.status(200).json(loginOutput);
				} catch (error) {
					return next(error);
				}
			}
		)(req, res);
	};

	private disableRefreshToken = async (req: IRequestWithUser, res: Response, next: NextFunction): Promise<void> => {
		const { refreshTokenToDisable } = req.body;
		try {
			const message = await deleteRefreshToken(refreshTokenToDisable);
			const logInfoMessage = `The access token for username=${req.user.login} has been deleted.`
			infoLogger(req, res, 200, logInfoMessage);
			res.status(200).json({ message });
		} catch (error) {
			next(error);
		}
	};

	private disableRefreshTokenById = async (req: IRequestWithUser, res: Response, next: NextFunction): Promise<void> => {
		const refreshTokenId = parseInt(req.params.refreshTokenId, 10);
		try {
			const message = await deleteRefreshTokenById(refreshTokenId);
			const logInfoMessage = `The access token for username=${req.user.login} has been deleted.`
			infoLogger(req, res, 200, logInfoMessage);
			res.status(200).json({ message });
		} catch (error) {
			next(error);
		}
	};

	private numComponentsManagedByUser = async (req: IRequestWithUser, res: Response, next: NextFunction): Promise<void> => {
		try {
			const componentsManaged: IComponentsManagedByUser = {
				userRole: "User",
				numOrganizationsManaged: 0,
				numGroupsManaged: 0,
				numAssetsManaged: 0,
				numSensorsManaged: 0,
				numDigitalTwinsManaged: 0,
				numMLModelsManaged: 0,
			};

			if (req.user.isGrafanaAdmin) {
				componentsManaged.userRole = "PlatformAdmin";
				componentsManaged.numOrganizationsManaged = await getNumOrganizations();
				componentsManaged.numGroupsManaged = await getNumGroups();
				componentsManaged.numAssetsManaged = await getNumAssets();
				componentsManaged.numSensorsManaged = await getNumSensors();
				componentsManaged.numDigitalTwinsManaged = await getNumDigitalTwins();
			} else {
				const organizationsManagedByUser = await getOrganizationsManagedByUserId(req.user.id);
				const groupsManagedByUser = await getGroupsManagedByUserId(req.user.id);
				const allGroupsManagedByUser = [...groupsManagedByUser];
				const groupsIdArray = [];
				if (organizationsManagedByUser.length) {
					componentsManaged.userRole = "OrgAdmin";
					componentsManaged.numOrganizationsManaged = organizationsManagedByUser.length;
					const orgIdsArray = organizationsManagedByUser.map(org => org.id);
					const groupsInOrgs = await getAllGroupsInOrgArray(orgIdsArray)
					const groupsIdArrayManagedByUser = groupsManagedByUser.map(group => group.id);
					groupsInOrgs.forEach(groupInOrg => {
						if (groupsIdArrayManagedByUser.indexOf(groupInOrg.id) === -1) allGroupsManagedByUser.push(groupInOrg);
					});
					componentsManaged.numGroupsManaged = allGroupsManagedByUser.length;
					groupsIdArray.push(...allGroupsManagedByUser.map(group => group.id));
				}
				else {
					if (groupsManagedByUser.length !== 0) {
						componentsManaged.userRole = "GroupAdmin";
						componentsManaged.numGroupsManaged = groupsManagedByUser.length;
						groupsIdArray.push(...allGroupsManagedByUser.map(group => group.id));
					}
				}
				componentsManaged.numAssetsManaged = await getNumAssetsByGroupsIdArray(groupsIdArray);
				componentsManaged.numSensorsManaged = await getNumSensorsByGroupsIdArray(groupsIdArray);
				componentsManaged.numDigitalTwinsManaged = await getNumDigitalTwinsByGroupsIdArray(groupsIdArray);
				componentsManaged.numMLModelsManaged = await getNumMLModelsByGroupsIdArray(groupsIdArray);
			}
			res.status(200).send(componentsManaged);
		} catch (error) {
			next(error);
		}
	};


	private disableUsersRefreshToken = async (req: IRequestWithUser, res: Response, next: NextFunction): Promise<void> => {
		const userId = parseInt(req.params.userId, 10);
		try {
			const message = await deleteUserRefreshTokens(userId);
			res.status(200).json({ message });
		} catch (error) {
			next(error);
		}
	};

	private getRefreshTokens = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
		try {
			const refreshTokens = await getAllRefreshTokens();
			refreshTokens.forEach(token => {
				token.createdAtAge = generateLastSeenAtAgeString(token.createdAtAge);
				token.updatedAtAge = generateLastSeenAtAgeString(token.updatedAtAge);
			});
			res.status(200).json(refreshTokens);
		} catch (error) {
			next(error);
		}
	};

}

export default AuthenticationController;

