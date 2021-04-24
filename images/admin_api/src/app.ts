import bodyParser from "body-parser";
import express, { Request, Response, NextFunction} from "express";
import https from "https";
import fs from "fs";
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

const httpsOptions = {
	key: fs.readFileSync("./ssl_config/iot_platform.key"),
	cert: fs.readFileSync("./ssl_config/iot_platform_cert.cer"),
};

class App {
	private app: express.Application;
	private port: number;
	private server: https.Server;

	constructor(controllers: IController[]) {
		this.app = express();
		this.server = https.createServer(httpsOptions, this.app);
		this.port = 3200;

		this.initializeMiddlewares();
		this.initializeControllers(controllers);
		this.initializeErrorHandling();
		this.dbConnect();
		this.mailerReady();
	}

	public listen(): void {
		this.server.listen(this.port, () => {
			const date = Date();
			logger.log("info", `App listening on port ${this.port} - ${date}`);
		});
	}

	public getServer(): express.Application {
		return this.app;
	}

	private initializeMiddlewares(): void {
		this.app.use(bodyParser.json());
		this.app.set("json spaces", 4);
		this.app.use(helmet());
		this.app.use(compression());
		this.app.use(cors());
		this.app.use(morgan(morganOption, { stream }));
	}

	private initializeErrorHandling(): void {
		this.app.use(errorMiddleware);
	}

	private initializeSwagger(): void {
		const options = {
			swaggerOptions: {
				docExpansion: 'none'
			}
		};
		const platformName = `${process.env.PLATFORM_NAME.replace(/_/g, " ").toUpperCase()} Platform`;
		const platformPhrase = `${process.env.PLATFORM_PHRASE}`;
		const serverUrl = `https://${process.env.DOMAIN_NAME}/admin_api/`;
		this.app.use("/swagger", (req: IRequestWithSwaggerDoc, res: Response, next: NextFunction) => {
			(swaggerDocument as any).info.title = platformName;
			(swaggerDocument as any).info.description = platformPhrase;
			(swaggerDocument as any).servers[0].url = serverUrl;
			req.swaggerDoc = swaggerDocument;
			next();
		}, swaggerUi.serve, swaggerUi.setup(swaggerDocument, options));
	}

	private dbConnect() {
		pool.connect((error, client, done) => {
			if (error) return logger.log("error", "Database connection failed: %s ", error.message);
			logger.log("info", "Database connected");
		});
	}

	private mailerReady() {
		transporter.verify().then(() => {
			logger.log("info", "Ready for send emails");
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
