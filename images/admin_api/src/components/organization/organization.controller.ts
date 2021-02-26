// import { Router, NextFunction, Request, Response } from "express";
// import { getRepository, getCustomRepository } from "typeorm";
// import IController from "../../interfaces/controller.interface";
// import validationMiddleware from "../../middleware/validation.middleware";
// import organizatoinExists from "../../middleware/organizatoinExists.middleware";
// import CreateOrganizationDto from "./organizatoin.dto";
// import CreateOrganizationAdminArrayToAddDto from "./organizatoinAdminArrayToAdd.dto";
// import CreateOrganizationAdminArrayToRemoveDto from "./organizatoinAdminArrayToRemove.dto";
// import IRequestWithOrganization from "../../interfaces/requestWithOrganization.interface";
// import OrganizationToUser from "../../models/organizatoinToUser";
// import OrganizationRepository from "../../repositories/organizatoin.repository";
// import UserRepository from "../../repositories/user.repository";
// import { superAdminAuth } from "../../middleware/auth.middleware";

// class OrganizationController implements IController {
//   public path = "/organization";

//   public router = Router();

//   private organizatoinRepository = getCustomRepository(OrganizationRepository);

//   private userRepository = getCustomRepository(UserRepository);

//   private organizatoinToUserRepository = getRepository(OrganizationToUser);

//   constructor() {
//     this.initializeRoutes();
//   }

//   private initializeRoutes(): void {
//     this.router.get(`${this.path}/all_organization`, superAdminAuth, this.getAllOrganization);

//     this.router.get(
//       `${this.path}/organizatoin_by_prop/:propName/:propValue`,
//       superAdminAuth,
//       this.getOrganizationByProp
//     );

//     this.router
//       .patch(
//         `${this.path}/organizatoin_by_prop/:propName/:propValue`,
//         superAdminAuth,
//         validationMiddleware<CreateOrganizationDto>(CreateOrganizationDto, true),
//         this.modifyOrganizationByProp
//       )
//       .delete(`${this.path}/organizatoin_by_prop/:propName/:propValue`, superAdminAuth, this.deleteOrganizationByProp)
//       .post(
//         this.path,
//         superAdminAuth,
//         validationMiddleware<CreateOrganizationDto>(CreateOrganizationDto),
//         this.createOrganization
//       );

//     this.router
//       .post(
//         `${this.path}/organizatoin_admin/:organizatoinId`,
//         superAdminAuth,
//         organizatoinExists,
//         validationMiddleware<CreateOrganizationAdminArrayToAddDto>(CreateOrganizationAdminArrayToAddDto),
//         this.addOrganizationAdmin
//       )
//       .delete(
//         `${this.path}/organizatoin_admin/:organizatoinId`,
//         superAdminAuth,
//         organizatoinExists,
//         validationMiddleware<CreateOrganizationAdminArrayToRemoveDto>(CreateOrganizationAdminArrayToRemoveDto),
//         this.removeOrganizationAdmin
//       );
//   }

//   private createOrganization = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
//     const organizatoinData: CreateOrganizationDto = req.body;
//     try {
//       const newOrganization = await this.organizatoinRepository.createOrganization(organizatoinData);
//       const newOrganizationWithAdminList = OrganizationRepository.addVoidAdminListToOrganization(newOrganization);
//       res.status(201).send(newOrganizationWithAdminList);
//     } catch (error) {
//       next(error);
//     }
//   };

//   private addOrganizationAdmin = async (
//     req: IRequestWithOrganization,
//     res: Response,
//     next: NextFunction
//   ): Promise<void> => {
//     const { organizatoin } = req;
//     const instAdminEmailsArray: string[] = req.body.instAdminToAddEmailsList;

//     try {
//       const newOrganizationAdminList = await this.organizatoinRepository.addOrganizationAdmin(
//         organizatoin,
//         instAdminEmailsArray
//       );
//       res.status(200).send(newOrganizationAdminList);
//     } catch (error) {
//       next(error);
//     }
//   };

//   private removeOrganizationAdmin = async (
//     req: IRequestWithOrganization,
//     res: Response,
//     next: NextFunction
//   ): Promise<void> => {
//     const { organizatoin } = req;
//     const instAdminEmailsArray: string[] = req.body.instAdminToRemoveEmailsList;

//     try {
//       const message = await this.organizatoinRepository.removeOrganizationAdmin(organizatoin, instAdminEmailsArray);
//       res.status(200).json({ message });
//     } catch (error) {
//       next(error);
//     }
//   };

//   private getAllOrganization = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
//     try {
//       const organizationWithAdminList = await this.organizatoinRepository.getAllOrganization();
//       res.status(200).send(organizationWithAdminList);
//     } catch (error) {
//       next(error);
//     }
//   };

//   private getOrganizationByProp = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
//     const { propName, propValue } = req.params;
//     try {
//       const organizatoinWithAdminList = await this.organizatoinRepository.giveOrganizationByProp(propName, propValue);
//       res.status(200).send(organizatoinWithAdminList);
//     } catch (error) {
//       next(error);
//     }
//   };

//   private modifyOrganizationByProp = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
//     const { propName, propValue } = req.params;
//     const organizatoinData: CreateOrganizationDto = req.body;

//     try {
//       const organizatoinWithAdminList = await this.organizatoinRepository.modifyOrganizationByProp(
//         propName,
//         propValue,
//         organizatoinData
//       );
//       res.status(200).send(organizatoinWithAdminList);
//     } catch (error) {
//       next(error);
//     }
//   };

//   private deleteOrganizationByProp = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
//     const { propName, propValue } = req.params;
//     try {
//       const message = await this.organizatoinRepository.deleteOrganizationByProp(propName, propValue);
//       res.status(200).json({ message });
//     } catch (error) {
//       next(error);
//     }
//   };
// }

// export default OrganizationController;
