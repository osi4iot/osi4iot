// import { NextFunction, Response } from "express";
// import { getRepository } from "typeorm";
// import isValidUUIDv4 from "../utils/validators/isValidUIIDv4";
// import IRequestWithOrganization from "../interfaces/requestWithOrganization.interface";
// import Organization from "../models/organization";
// import OrganizationNotFoundException from "../exceptions/OrganizationNotFoundException";
// import NotValidUUIDv4Exception from "../exceptions/NotValidUUIDv4Exception";

// async function organizationExists(
//   request: IRequestWithOrganization,
//   response: Response,
//   next: NextFunction
// ): Promise<void> {
//   const { organizationId } = request.params;
//   if (organizationId && !isValidUUIDv4(organizationId)) {
//     next(new NotValidUUIDv4Exception("Organization", organizationId));
//   } else {
//     const organizationRepository = getRepository(Organization);
//     const existingOrganization = await organizationRepository.findOne(organizationId);
//     if (!existingOrganization) {
//       next(new OrganizationNotFoundException("id", organizationId));
//     } else {
//       request.organization = existingOrganization;
//       next();
//     }
//   }
// }

// export default organizationExists;
