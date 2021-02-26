import { Router, NextFunction, Request, Response } from "express";
import IController from "../../interfaces/controller.interface";

class HealthCheckController implements IController {
  public path = "/health";

  public router = Router();

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    this.router.get(`${this.path}`, this.healthCheck);
  }

  private healthCheck = (req: Request, res: Response): void => {
    res.status(200).json({ success: true, message: "It is working" });
  };
}

export default HealthCheckController;
