/* eslint-disable @typescript-eslint/no-unused-vars */
import bodyParser from "body-parser";
import express, { Response, NextFunction } from "express";
import helmet from "helmet";
import cors from "cors";
import morgan from "morgan";
import compression from "compression";
import swaggerUi from "swagger-ui-express";
import * as swaggerDocument from "./swagger.json";
import { logger, stream } from "./config/winston";
import morganOption from "./config/morgan";
import IController from "./interfaces/controller.interface";
import errorMiddleware from "./middleware/error.middleware";
import pool from "./config/dbconfig";
import transporter from "./config/mailer";
import IRequestWithSwaggerDoc from "./interfaces/requestWithSwaggerDoc";
import getDomainUrl from "./utils/helpers/getDomainUrl";
import process_env from "./config/api_config";
import timescaledb_pool from "./config/timescaledb_config";

class App {
	private app: express.Application;
	private port: number;

	constructor(controllers: IController[]) {
		this.app = express();
		this.port = 3200;

		this.initializeMiddlewares();
		this.initializeControllers(controllers);
		this.initializeErrorHandling();
		this.dbConnect();
		this.mailerReady();
	}

	public listen(): void {
		this.app.listen(this.port, () => {
			const date = Date();
			logger.log("info", `App listening on port ${this.port} - ${date}`);
		});
	}

	public getServer(): express.Application {
		return this.app;
	}

	private initializeMiddlewares(): void {
		this.app.use(bodyParser.json({ limit: "1000mb" }));
		this.app.use(
			bodyParser.urlencoded({ limit: "1000mb", extended: true })
		);
		this.app.set("json spaces", 4);
		this.app.use(helmet());
		this.app.use(compression());
		this.app.use(cors());
		this.app.set("trust proxy", true);
		this.app.use(
			morgan(morganOption, {
				stream,
				skip: (req: any, res) => {
					return req.url === "/health";
				},
			})
		);
	}

	private initializeErrorHandling(): void {
		this.app.use(errorMiddleware);
	}

	private initializeSwagger(): void {
		const options = {
			swaggerOptions: {
				docExpansion: "none",
			},
		};
		const platformName = `${process_env.PLATFORM_NAME.replace(
			/_/g,
			" "
		).toUpperCase()} Platform`;
		const platformPhrase = `${process_env.PLATFORM_PHRASE}`;
		const serverUrl = `${getDomainUrl()}/admin_api/`;
		this.app.use(
			"/swagger",
			(
				req: IRequestWithSwaggerDoc,
				res: Response,
				next: NextFunction
			) => {
				(swaggerDocument as any).info.title = platformName;
				(swaggerDocument as any).info.description = platformPhrase;
				(swaggerDocument as any).servers[0].url = serverUrl;
				req.swaggerDoc = swaggerDocument;
				next();
			},
			swaggerUi.serve,
			swaggerUi.setup(swaggerDocument, options)
		);
	}

	private dbConnect() {
		pool.connect((error, client, done) => {
			if (error)
				return logger.log(
					"error",
					"Database connection failed: %s ",
					error.message
				);
			logger.log("info", "Postgres database connected");
		});

		timescaledb_pool.connect((error, client, done) => {
			if (error)
				return logger.log(
					"error",
					"Database connection failed: %s ",
					error.message
				);
			logger.log("info", "Timecaledb database connected");
		});
	}

	private mailerReady() {
		transporter
			.verify()
			.then(() => {
				logger.log("info", "Ready for send emails");
			})
			.catch((err) => {
				logger.log(
					"error",
					"Mailer connection has been failed:",
					err.message
				);
			});
	}

	private initializeControllers(controllers: IController[]): void {
		controllers.forEach((controller) => {
			this.app.use("/", controller.router);
		});
		this.initializeSwagger();

		this.app.get("/health", (req, res) => {
			res.send({ success: true, message: "It is working" });
		});

		this.app.all("/*", (req, res) => {
			res.status(400).json({ errorMessage: "Invalid request" });
		});
	}
}

export default App;
