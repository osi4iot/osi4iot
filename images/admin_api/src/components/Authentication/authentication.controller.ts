import { Router, NextFunction, Request, Response } from "express";
import passport from "passport";
import jwt from "jsonwebtoken";
import HttpException from "../../exceptions/HttpException";
import IController from "../../interfaces/controller.interface";
import validationMiddleware from "../../middleware/validation.middleware";
import CreateLoginDto from "./login.dto";
import CreateChangePasswordDto from "./changePassword.dto";
import IRequestWithUser from "../../interfaces/requestWithUser.interface";
import passportInitialize from "../../config/passportHandler";
import { userAuth, superAdminAuth } from "../../middleware/auth.middleware";
import GrafanaApi from '../../GrafanaApi/grafanaApi';


interface IJwtPayload {
  id: string;
  email: string;
  iat: number;
  exp: number;
}

interface ILoginOutput {
  accesToken: string;
}

class AuthenticationController implements IController {
  public path = "/auth";

  public router = Router();

  private grafanaApi = new GrafanaApi();

  private userRepository = {
    save: (user: any) => true,
  };

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    passportInitialize();
    this.router.post(`${this.path}/login`, validationMiddleware<CreateLoginDto>(CreateLoginDto), this.userLogin);
    this.router.patch(
      `${this.path}/change_password`,
      userAuth,
      validationMiddleware<CreateChangePasswordDto>(CreateChangePasswordDto),
      this.changePassword
    );
  }

  private userLogin =  (req: Request, res: Response, next: NextFunction): void => {
    passport.authenticate(
      "local-login",
      { session: false },
      async (err, user): Promise<Response | void> => {
        if (err || !user) {
          const errorMessage = "User credentials not correct.";
          return next(new HttpException(400, errorMessage));
        }
        let isSuperAdmin = false;
        if (process.env.UPERADMIN_EMAIL_OR_LOGIN === user.email) {
          isSuperAdmin = true;
        }

        const payload = {
          id: user.id,
          login: user.login
        };

        const algorithm = process.env.JWT_ALGORITHM as jwt.Algorithm;
        const accesToken = jwt.sign({ ...payload }, process.env.ACCESS_TOKEN_SECRET, {
          algorithm,
          expiresIn: parseInt(process.env.ACCESS_TOKEN_LIFETIME, 10)
        });

        try {
          const loginOutput: ILoginOutput = {
            accesToken
          };
          return res.status(200).json({ data: loginOutput });
        } catch (error) {
          return next(error);
        }
      }
    )(req, res);
  };

  private changePassword = async (req: IRequestWithUser, res: Response, next: NextFunction): Promise<void> => {
    const { user } = req;
    const { newPassword } = req.body;
    const { email } = user;
    const { message } = await this.grafanaApi.changeUserPassword(user.id, newPassword);

    if (message !== "User password updated") {
      const errorMessage = `The password of user with email: ${email} could not be modified`;
      next(new HttpException(400, errorMessage));
    } else {
      const okMessage = `The password of the user with email: ${email} has been modified correctly`;
      res.status(200).json({ okMessage });
    }
  };
}

export default AuthenticationController;
