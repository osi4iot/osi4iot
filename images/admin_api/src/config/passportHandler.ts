/* eslint-disable quotes */
import passport from "passport";
import passportLocal from "passport-local";
import passportJwt from "passport-jwt";
import { getUserLoginDatadByEmailOrLogin, getUserdByEmailOrLogin } from "../components/user/userDAL";
import verifiyPassword from "../utils/helpers/verifiyPassword";


export default function passportInitialize(): void {
	const LocalStrategy = passportLocal.Strategy;
	const JwtStrategy = passportJwt.Strategy;
	const { ExtractJwt } = passportJwt;

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
					user = await getUserdByEmailOrLogin(jwtPayload.email);
					if (!user || jwtPayload.action !== "access") {
						return done(null, false);
					}
					return done(null, user);
				} catch (err) {
					return done(err, null); // Error in DB
				}
			}
		)
	);

	passport.use(
		"register_jwt",
		new JwtStrategy(
			optsAccessToken,
			// prettier-ignore
			async (jwtPayload, done) => {
				let user;
				try {
					user = await getUserdByEmailOrLogin(jwtPayload.email);
					if (!user || jwtPayload.action !== "registration") {
						return done(null, false);
					}
					return done(null, user);
				} catch (err) {
					return done(err, null); // Error in DB
				}
			}
		)
	);

	const optsRefreshToken = {
		jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
		secretOrKey: process.env.REFRESH_TOKEN_SECRET,
		algorithms: [process.env.JWT_ALGORITHM]
	};

	passport.use(
		"refresh_jwt",
		new JwtStrategy(
			optsRefreshToken,
			// prettier-ignore
			async (jwtPayload, done) => {
				let user;
				try {
					user = await getUserdByEmailOrLogin(jwtPayload.email);
					if (!user || jwtPayload.action !== "refresh_token") {
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
