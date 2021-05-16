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
import { updateOrganizationUser } from "../user/userDAL";
import IUser from "../user/interfaces/User.interface";
import RefreshTokenToDisableDto from "./refreshTokenToDisableDTO";
import { deleteRefreshToken, deleteUserRefreshTokens, exitsRefreshToken, getAllRefreshTokens, getRefreshTokenByUserId, insertRefreshToken, updateRefreshToken } from "./authenticationDAL";
import { getAllDevices, getDevicesByGroupsIdArray, getNumDevices, getNumDevicesByGroupsIdArray } from "../device/deviceDAL";
import { getNumOrganizations, getOrganizations, getOrganizationsManagedByUserId } from "../organization/organizationDAL";
import { getAllGroups, getAllGroupsInOrgArray, getGroupsManagedByUserId, getNumGroups, getNumGroupsManagedByUserId } from "../group/groupDAL";
import IComponentsManagedByUser from "./ComponentsManagedByUser.interface";
import generateLastSeenAtAgeString from "../../utils/helpers/generateLastSeenAtAgeString";

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
		this.router.patch(
			`${this.path}/change_password`,
			userAuth,
			validationMiddleware<CreateChangePasswordDto>(CreateChangePasswordDto),
			this.changePassword
		);

		this.router.get(`${this.path}/refresh_tokens/`, superAdminAuth, this.getRefreshTokens);
		this.router.patch(`${this.path}/update_refresh_token/`, this.refreshToken);
		this.router.delete(`${this.path}/disable_refresh_token/`, superAdminAuth, validationMiddleware<RefreshTokenToDisableDto>(RefreshTokenToDisableDto), this.disableRefreshToken);
		this.router.delete(`${this.path}/disable_user_refresh_tokens/:userId`, superAdminAuth, this.disableUsersRefreshToken);
		this.router.get(`${this.path}/user_managed_components`, userAuth, this.numComponentsManagedByUser);
	}

	private generateNewRefreshToken = (user: IUser) => {
		const payloadRefreshToken = {
			id: user.id,
			email: user.email,
			action: "refresh_token"
		};

		const algorithm = process.env.JWT_ALGORITHM as jwt.Algorithm;
		const refreshToken = jwt.sign({ ...payloadRefreshToken }, process.env.REFRESH_TOKEN_SECRET, {
			algorithm,
			expiresIn: parseInt(process.env.REFRESH_TOKEN_LIFETIME, 10)
		});

		return refreshToken;

	}

	private generateLoginOutput = async (user: IUser): Promise<ILoginOutput> => {
		const payloadAccessToken = {
			id: user.id,
			email: user.email,
			action: "access"
		};

		let loginOutput: ILoginOutput;
		const algorithm = process.env.JWT_ALGORITHM as jwt.Algorithm;
		const accessToken = jwt.sign({ ...payloadAccessToken }, process.env.ACCESS_TOKEN_SECRET, {
			algorithm,
			expiresIn: parseInt(process.env.ACCESS_TOKEN_LIFETIME, 10)
		});
		const decodedAccessToken = jwt.decode(accessToken) as IJwtPayload;
		const expirationDate = (new Date(decodedAccessToken.exp * 1000)).toString();

		const existentRefreshToken = await getRefreshTokenByUserId(user.id);
		let refreshToken;
		if (existentRefreshToken) {
			const decodedRefreshToken = jwt.decode(existentRefreshToken.token) as IJwtPayload;
			const refreshTokenExpirationDate = new Date(decodedRefreshToken.exp * 1000);
			const timeframe = parseInt(process.env.REFRESH_TOKEN_LIFETIME, 10) * 0.1;
			const accessTokenLifeTime = parseInt(process.env.ACCESS_TOKEN_LIFETIME, 10);
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

		loginOutput = {
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
			async (err, user): Promise<Response | void> => {
				if (err || !user) {
					const errorMessage = "User credentials not correct.";
					return next(new HttpException(400, errorMessage));
				}

				try {
					const loginOutput = await this.generateLoginOutput(user);
					return res.status(200).json(loginOutput);
				} catch (error) {
					return next(error);
				}
			}
		)(req, res);
	};

	private userRegister = async (req: IRequestWithUser, res: Response, next: NextFunction): Promise<void> => {
		try {
			const { user } = req;
			const registerDto: UserRegisterDto = req.body;
			if (user.email !== registerDto.email) {
				const errorMessage = "The email indicated not match with the user email in database";
				throw new HttpException(400, errorMessage);
			}
			registerDto.userId = user.id;
			const { message } = await this.grafanaRepository.changeUserPassword(user.id, registerDto.password);
			await updateOrganizationUser(registerDto);

			if (message !== "User password updated") {
				const errorMessage = "The password could not be updated";
				throw new HttpException(400, errorMessage);
			} else {
				const okMessage = "User registered successfully";
				res.status(200).json({ message: okMessage });
			}
		} catch (error) {
			return next(error);
		}

	};

	private getUserRegisterData = async (req: IRequestWithUser, res: Response, next: NextFunction): Promise<void> => {
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

	private getUserProfile = async (req: IRequestWithUser, res: Response, next: NextFunction): Promise<void> => {
		try {
			const { user } = req;
			const userData = {
				userId: user.id,
				firstName: user.firstName,
				surname: user.surname,
				email: user.email,
				login: user.login,
				telegramId: user.telegramId,
			}
			res.status(200).json(userData);
		} catch (error) {
			return next(error);
		}
	};

	private changePassword = async (req: IRequestWithUser, res: Response, next: NextFunction): Promise<void> => {
		const { user } = req;
		const { newPassword } = req.body;
		const { email } = user;
		const { message } = await this.grafanaRepository.changeUserPassword(user.id, newPassword);

		if (message !== "User password updated") {
			const errorMessage = `The password of user with email: ${email} could not be modified`;
			next(new HttpException(400, errorMessage));
		} else {
			const okMessage = `The password of the user with email: ${email} has been modified correctly`;
			res.status(200).json({ message: okMessage });
		}
	};

	private refreshToken = (req: Request, res: Response, next: NextFunction): void => {
		passport.authenticate(
			"refresh_jwt",
			{ session: false },
			async (err, user, info): Promise<Response | void> => {
				if (info) {
					return next(new HttpException(401, info.message));
				}

				if (err) {
					return next(err);
				}

				if (!user) {
					return next(new HttpException(401, "You are not allowed to access."));
				}

				try {
					const oldRefreshToken: string = req.headers.authorization.slice(7);
					const isRefreshTokenCorrect = await exitsRefreshToken(oldRefreshToken);
					if (!isRefreshTokenCorrect) {
						return next(new HttpException(404, "The refresh token supplied does not exist"));
					}
					const loginOutput = await this.generateLoginOutput(user);
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
				numDevicesManaged: 0
			};

			if (req.user.isGrafanaAdmin) {
				componentsManaged.userRole = "PlatformAdmin";
				componentsManaged.numOrganizationsManaged = await getNumOrganizations();
				componentsManaged.numGroupsManaged = await getNumGroups();
				componentsManaged.numDevicesManaged = await getNumDevices();
			} else {
				const organizationsManagedByUser = await getOrganizationsManagedByUserId(req.user.id);
				const groupsManagedByUser = await getGroupsManagedByUserId(req.user.id);
				const allGroupsManagedByUser = [...groupsManagedByUser];
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
					const allGroupsIdArrayManagedByUser = allGroupsManagedByUser.map(group => group.id);
					componentsManaged.numDevicesManaged = await getNumDevicesByGroupsIdArray(allGroupsIdArrayManagedByUser);
				}
				else {
					if (groupsManagedByUser.length !== 0) {
						componentsManaged.userRole = "GroupAdmin";
						componentsManaged.numGroupsManaged = groupsManagedByUser.length;
						const allGroupsIdArrayManagedByUser = allGroupsManagedByUser.map(group => group.id);
						componentsManaged.numDevicesManaged = await getNumDevicesByGroupsIdArray(allGroupsIdArrayManagedByUser);
					}
				}
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
			console.log("refreshTokens=", refreshTokens)
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

