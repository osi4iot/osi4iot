import bodyParser from "body-parser";
import express from "express";
import https from "https";
import fs from "fs";
import helmet from "helmet";
import cors from "cors";
import morgan from "morgan";
import compression from "compression";
import swaggerUi from "swagger-ui-express";
import * as swaggerDocument from "./swagger.json";
import { logger as winston, stream } from "./config/winston";
import morganOption from "./config/morgan";
import IController from "./interfaces/controller.interface";
import errorMiddleware from "./middleware/error.middleware";
import pool from "./config/dbconfig";
import { ConsoleTransportOptions } from "winston/lib/winston/transports";

const httpsOptions = {
  key: fs.readFileSync("./ssl_config/iot_platform.key"),
  cert: fs.readFileSync("./ssl_config/iot_platform.cer"),
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
  }

  public listen(): void {
    this.server.listen(this.port, () => {
      const date = Date();
      winston.log("info", `App listening on the port ${this.port} - ${date}`);
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
    this.app.use("/swagger", swaggerUi.serve, swaggerUi.setup(swaggerDocument));
  }

  private dbConnect() {
    pool.connect((error, client, done) => {
      if (error) return winston.log("error", "Database connection failed: %s ", error.message);
      winston.log("info", "Database connected");
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
