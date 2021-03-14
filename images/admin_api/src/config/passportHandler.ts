/* eslint-disable quotes */
import passport from "passport";
import passportLocal from "passport-local";
import passportJwt from "passport-jwt";
import { getUserLoginDatadByEmailOrLogin, getUserdByEmailOrLogin } from "../components/user/userDAL";
import verifiyPassword from "../utils/helpers/verifiyPassword";
import GrafanaApi from '../GrafanaApi/grafanaApi';


export default function passportInitialize(): void {
	const LocalStrategy = passportLocal.Strategy;
	const JwtStrategy = passportJwt.Strategy;
	const { ExtractJwt } = passportJwt;
	const grafanaApi = new GrafanaApi();

	passport.use(
		"local-login",
		new LocalStrategy(
			{
				usernameField: "emailOrLogin",
				passwordField: "password",
				passReqToCallback: true,
				session: false
			},
			async (req, emailOrLogin, password, done) => {
				let user;
				try {
					user = await getUserLoginDatadByEmailOrLogin(emailOrLogin);
					if (!user) {
						return done(null, false, { message: 'No user by that email or login' });
					}
				} catch (e) {
					return done(e);
				}

				const match = verifiyPassword(password, user.password, user.salt);
				if (!match) {
					return done(null, false, { message: 'Not a matching password' });
				}

				return done(null, user);

			}

		)
	);

	const optsAccessToken = {
		jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
		secretOrKey: process.env.ACCESS_TOKEN_SECRET,
		algorithms: [process.env.JWT_ALGORITHM]
	};

	passport.use(
		"access_jwt",
		new JwtStrategy(
			optsAccessToken,
			// prettier-ignore
			async (jwtPayload, done) => {
				let user;
				try {
					user = await getUserdByEmailOrLogin(jwtPayload.login);
					if (!user) {
						return done(null, false);
					}
					return done(null, user);
				} catch (err) {
					return done(err, null); // Error in DB
				}
			}
		)
	);

}
