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
import groupExists from "../../middleware/groupExists.middleware";
import { haveThisUserGroupAdminPermissions } from "../group/groupDAL";
import IRequestWithGroup from "../group/interfaces/requestWithGroup.interface";
import CreateLongTermTokenDto from "./longTermToken.dto";
import IUser from "../user/interfaces/User.interface";
import RefreshTokenToDisableDto from "./refreshTokenToDisableDTO";
import { deleteRefreshToken, deleteUserRefreshTokens, exitsRefreshToken, insertRefreshToken, updateRefreshToken } from "./authenticationDAL";


interface IJwtPayload {
	id: string;
	email: string;
	iat: number;
	exp: number;
}

interface ILoginOutput {
	accessToken: string;
	refreshToken: string;
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
		this.router.patch(
			`${this.path}/change_password`,
			userAuth,
			validationMiddleware<CreateChangePasswordDto>(CreateChangePasswordDto),
			this.changePassword
		);

		this.router.patch(`${this.path}/refresh_token/`, this.refreshToken);
		this.router.delete(`${this.path}/disable_refresh_token/`, superAdminAuth, validationMiddleware<RefreshTokenToDisableDto>(RefreshTokenToDisableDto), this.disableRefreshToken);
		this.router.delete(`${this.path}/disable_user_refresh_tokens/:userId`, superAdminAuth, this.disableUsersRefreshToken);

	}

	private generateLoginOutput = (user: IUser): ILoginOutput => {
		const payloadAccessToken = {
			id: user.id,
			email: user.email,
			action: "access"
		};

		const algorithm = process.env.JWT_ALGORITHM as jwt.Algorithm;
		const accessToken = jwt.sign({ ...payloadAccessToken }, process.env.ACCESS_TOKEN_SECRET, {
			algorithm,
			expiresIn: parseInt(process.env.ACCESS_TOKEN_LIFETIME, 10)
		});


		const payloadRefreshToken = {
			id: user.id,
			email: user.email,
			action: "refresh_token"
		};

		const  refreshToken	= jwt.sign({ ...payloadRefreshToken }, process.env.REFRESH_TOKEN_SECRET, {
			algorithm,
			expiresIn: parseInt(process.env.REFRESH_TOKEN_LIFETIME, 10)
		});

		const loginOutput: ILoginOutput = {
			accessToken,
			refreshToken
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
					const loginOutput = this.generateLoginOutput(user);
					await insertRefreshToken(user.id, loginOutput.refreshToken);
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
					if (!isRefreshTokenCorrect ) {
					  return next(new HttpException(404, "The refresh token supplied does not exist"));
					}
					const loginOutput = this.generateLoginOutput(user);
					await updateRefreshToken(oldRefreshToken, loginOutput.refreshToken);
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

	private disableUsersRefreshToken = async (req: IRequestWithUser, res: Response, next: NextFunction): Promise<void> => {
		const userId = parseInt(req.params.userId,10);
		try {
			const message = await deleteUserRefreshTokens(userId);
			res.status(200).json({ message });
		} catch (error) {
			next(error);
		}
	};

}

export default AuthenticationController;

