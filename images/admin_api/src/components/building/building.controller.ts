
import { Router, NextFunction, Request, Response } from "express";
import pointOnFeature from '@turf/point-on-feature';
import { polygon } from '@turf/helpers';
import IController from "../../interfaces/controller.interface";
import validationMiddleware from "../../middleware/validation.middleware";
import { superAdminAuth, userAuth } from "../../middleware/auth.middleware";
import AlreadyExistingItemException from "../../exceptions/AlreadyExistingItemException";
import ItemNotFoundException from "../../exceptions/ItemNotFoundException";
import HttpException from "../../exceptions/HttpException";
import generateLastSeenAtAgeString from "../../utils/helpers/generateLastSeenAtAgeString";
import CreateFloorDto from "./floor.dto";
import CreateBuildingDto from "./building.dto";
import IRequestWithUser from "../../interfaces/requestWithUser.interface";
import { createBuilding, createFloor, deleteBuildingById, deleteFloorById, getAllFloors, getAllFloorsFromOrgIdArray, getAllBuildings, getBuildingByProp, getFloorByBuildingIdAndFloorNumber, getFloorById, getBuildingsFromOrgIdArray, updateBuildingById, updateFloorById } from "./buildingDAL";
import IBuiliding from "./building.interface";
import { getGroupsManagedByUserId } from "../group/groupDAL";
import { getOrganizationsManagedByUserId, getOrganizationsWithIdsArray } from "../organization/organizationDAL";
import IFloor from "./floor.interface";
import { findBuildingBounds, findFloorBounds } from "../../utils/geolocation.ts/geolocation";
import { logger } from "../../config/winston";
import infoLogger from "../../utils/logger/infoLogger";

class BuildingController implements IController {
	public path = "/building";

	public router = Router();

	constructor() {
		this.initializeRoutes();
	}

	private initializeRoutes(): void {
		this.router
			.get(
				`${this.path}s/user_groups_managed/`,
				userAuth,
				this.getBuildingsForOrgsWithGroupsManagedByUser
			)
			.get(
				`${this.path}_floors/user_groups_managed/`,
				userAuth,
				this.getFloorsForOrgsWithGroupsManagedByUser
			);

		this.router
			.post(
				`${this.path}_floor`,
				superAdminAuth,
				validationMiddleware<CreateFloorDto>(CreateFloorDto),
				this.addFloorToBuilding
			)

			.get(
				`${this.path}_floors`,
				superAdminAuth,
				this.getAllFloors
			)
			.get(
				`${this.path}_floor/:floorId`,
				superAdminAuth,
				this.getFloorById
			)
			.patch(
				`${this.path}_floor/:floorId`,
				superAdminAuth,
				validationMiddleware<CreateFloorDto>(CreateFloorDto, true),
				this.updateFloorById
			)
			.delete(
				`${this.path}_floor/:floorId`,
				superAdminAuth,
				this.removeFloorById
			);

		this.router.get(`${this.path}s`, superAdminAuth, this.getAllBuildings);

		this.router
			.get(
				`${this.path}/:buildingId`,
				superAdminAuth,
				this.getBuildingById
			)
			.post(
				this.path,
				superAdminAuth,
				validationMiddleware<CreateBuildingDto>(CreateBuildingDto),
				this.createBuilding
			)
			.patch(
				`${this.path}/:buildingId`,
				superAdminAuth,
				validationMiddleware<CreateBuildingDto>(CreateBuildingDto, true),
				this.updatedBuildingById
			)
			.delete(`${this.path}/:buildingId`, superAdminAuth, this.deleteBuildingById);

	}

	private getBuildingsForOrgsWithGroupsManagedByUser = async (req: IRequestWithUser, res: Response, next: NextFunction): Promise<void> => {
		try {
			let buildings: IBuiliding[] = [];
			if (req.user.isGrafanaAdmin) {
				buildings = await getAllBuildings();
			} else {
				const organizations = await getOrganizationsManagedByUserId(req.user.id);
				const orgsManagedIdArray = organizations.map(org => org.id);
				const groups = await getGroupsManagedByUserId(req.user.id);
				if (groups.length !== 0) {
					const orgIdsArray = groups.map(group => group.orgId);
					const orgsOfGroupsManaged = await getOrganizationsWithIdsArray(orgIdsArray)
					orgsOfGroupsManaged.forEach(org => {
						if (orgsManagedIdArray.indexOf(org.id) === -1) organizations.push(org);
					})
				}
				const orgsIdArray = organizations.map(org => org.id);
				if (orgsIdArray.length !== 0) {
					buildings = await getBuildingsFromOrgIdArray(orgsIdArray);
				}
			}
			buildings.forEach(building => {
				building.createdAtAge = generateLastSeenAtAgeString(building.createdAtAge);
				building.updatedAtAge = generateLastSeenAtAgeString(building.updatedAtAge);
			});
			res.status(200).send(buildings);
		} catch (error) {
			next(error);
		}
	};

	private getFloorsForOrgsWithGroupsManagedByUser = async (req: IRequestWithUser, res: Response, next: NextFunction): Promise<void> => {
		try {
			let floors: IFloor[] = [];
			if (req.user.isGrafanaAdmin) {
				floors = await getAllFloors();
			} else {
				const organizations = await getOrganizationsManagedByUserId(req.user.id);
				const orgsManagedIdArray = organizations.map(org => org.id);
				const groups = await getGroupsManagedByUserId(req.user.id);
				if (groups.length !== 0) {
					const orgIdsArray = groups.map(group => group.orgId);
					if (orgIdsArray.length !== 0) {
						const orgsOfGroupsManaged = await getOrganizationsWithIdsArray(orgIdsArray)
						orgsOfGroupsManaged.forEach(org => {
							if (orgsManagedIdArray.indexOf(org.id) === -1) organizations.push(org);
						})
					}
				}
				const orgsIdArray = organizations.map(org => org.id);
				if (orgsIdArray.length !== 0) {
					floors = await getAllFloorsFromOrgIdArray(orgsIdArray);
				}
			}
			floors.forEach(floor => {
				floor.createdAtAge = generateLastSeenAtAgeString(floor.createdAtAge);
				floor.updatedAtAge = generateLastSeenAtAgeString(floor.updatedAtAge);
			});
			res.status(200).send(floors);
		} catch (error) {
			next(error);
		}
	};


	private createBuilding = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
		try {
			const buildingData: CreateBuildingDto = req.body;
			const existBuilding = await getBuildingByProp("name", buildingData.name)
			if (existBuilding) {
				logger.error(`409 || ${res.statusMessage} - ${req.originalUrl} - ${req.method} - ${req.ip}`);
				throw new AlreadyExistingItemException(req, res, "A", "building", ["name"], [buildingData.name]);
			}
			if (buildingData.geoJsonData) {
				buildingData.outerBounds = findBuildingBounds(buildingData.geoJsonData);
				if (buildingData.longitude === 0 && buildingData.latitude === 0) {
					const geojsonObj = JSON.parse(buildingData.geoJsonData);
					let geoPolygon;
					if (geojsonObj.features[0].geometry.type === "Polygon") {
						geoPolygon = polygon(geojsonObj.features[0].geometry.coordinates);
					} else if (geojsonObj.features[0].geometry.type === "MultiPolygon") {
						geoPolygon = polygon(geojsonObj.features[0].geometry.coordinates[0]);
					}
					const center = pointOnFeature(geoPolygon);
					buildingData.longitude = center.geometry.coordinates[0];
					buildingData.latitude = center.geometry.coordinates[1];
				}
			}
			const building = await createBuilding(buildingData);
			if (!building) throw new HttpException(req, res, 500, "Could not be created a new building");
			const message = { message: "A new building has been created" };
			infoLogger(req, res, 200, message.message);
			res.status(201).send(message);
		} catch (error) {
			next(error);
		}
	};

	private addFloorToBuilding = async (
		req: Request,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const floorData: CreateFloorDto = req.body;
			const buildingId = floorData.buildingId;
			const floorNumber = floorData.floorNumber;
			const existBuilding = await getBuildingByProp("id", buildingId);
			if (!existBuilding) {
				throw new ItemNotFoundException(req, res, "The building", "id", buildingId.toString());
			}
			const existFloor = await getFloorByBuildingIdAndFloorNumber(buildingId, floorNumber);
			if (existFloor) {
				throw new AlreadyExistingItemException(
					req,
					res,
					"A",
					"building floor",
					["buildingId", "floorNumber"],
					[buildingId.toString(), floorNumber.toString()]
				);
			}
			if (floorData.geoJsonData) {
				floorData.outerBounds = findFloorBounds(floorData);
			}
			const Floor = await createFloor(floorData);
			if (!Floor) throw new HttpException(req, res, 500, "Could not be created a new building floor");
			const message = { message: "A new building floor has been created" };
			infoLogger(req, res, 200, message.message);
			res.status(200).send(message);
		} catch (error) {
			next(error);
		}
	};


	private removeFloorById = async (
		req: Request,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const { floorId } = req.params;
			const existFloor = await getFloorById(parseInt(floorId, 10));
			if (!existFloor) {
				throw new ItemNotFoundException(req, res, "The building floor", "id", floorId);
			}
			if (existFloor.id === 1) {
				throw new HttpException(req, res, 500, "The platform default floor can not be deleted.");
			}
			const response = await deleteFloorById(parseInt(floorId, 10));
			if (!response) throw new HttpException(req, res, 500, "The building floor could not be deleted");
			const message = { message: `Building floor deleted succesfully` }
			res.status(200).json(message);
		} catch (error) {
			next(error);
		}
	};

	private updateFloorById = async (
		req: Request,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const { floorId } = req.params;
			const FloorData: CreateFloorDto = req.body;
			const existFloor = await getFloorById(parseInt(floorId, 10));
			if (!existFloor) {
				throw new ItemNotFoundException(req, res, "The building floor", "id", floorId);
			}
			const updatedFloor = { ...existFloor, ...FloorData };
			const existUpdatedFloor = await getFloorByBuildingIdAndFloorNumber(updatedFloor.buildingId, updatedFloor.floorNumber);
			if (existFloor.id !== existUpdatedFloor.id) {
				throw new AlreadyExistingItemException(
					req,
					res,
					"A",
					"building floor",
					["buildingId", "floorNumber"],
					[updatedFloor.buildingId.toString(), updatedFloor.floorNumber.toString()]
				);
			}
			updatedFloor.outerBounds = findFloorBounds(updatedFloor);
			const response = await updateFloorById(parseInt(floorId, 10), updatedFloor);
			if (!response) throw new HttpException(req, res, 500, "The building floor could not be updated");
			const message = { message: `Building floor updated succesfully.` }
			infoLogger(req, res, 200, message.message);
			res.status(200).send(message);
		} catch (error) {
			next(error);
		}
	};

	private getFloorById = async (
		req: Request,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const { floorId } = req.params;
			const floor = await getFloorById(parseInt(floorId, 10));
			if (!floor) throw new ItemNotFoundException(req, res, "The building floor", "id", floorId);
			floor.createdAtAge = generateLastSeenAtAgeString(floor.createdAtAge);
			floor.updatedAtAge = generateLastSeenAtAgeString(floor.updatedAtAge);
			res.status(200).json(floor);
		} catch (error) {
			next(error);
		}
	};


	private getAllBuildings = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
		try {
			const buildings = await getAllBuildings();
			buildings.forEach(building => {
				building.createdAtAge = generateLastSeenAtAgeString(building.createdAtAge);
				building.updatedAtAge = generateLastSeenAtAgeString(building.updatedAtAge);
			});
			res.status(200).send(buildings);
		} catch (error) {
			next(error);
		}
	};

	private getAllFloors = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
		try {
			const floors = await getAllFloors();
			floors.forEach(floor => {
				floor.createdAtAge = generateLastSeenAtAgeString(floor.createdAtAge);
				floor.updatedAtAge = generateLastSeenAtAgeString(floor.updatedAtAge);
			});
			res.status(200).send(floors);
		} catch (error) {
			next(error);
		}
	};

	private getBuildingById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
		try {
			const { buildingId } = req.params;
			const building = await getBuildingByProp("id", buildingId);
			if (!building) throw new ItemNotFoundException(req, res, "The building", "id", buildingId);
			building.createdAtAge = generateLastSeenAtAgeString(building.createdAtAge);
			building.updatedAtAge = generateLastSeenAtAgeString(building.updatedAtAge);
			res.status(200).send(building);
		} catch (error) {
			next(error);
		}
	};

	private updatedBuildingById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
		try {
			const { buildingId } = req.params;
			const buildingData: CreateBuildingDto = req.body;
			const existBuilding = await getBuildingByProp("id", parseInt(buildingId, 10));
			if (!existBuilding) {
				throw new ItemNotFoundException(req, res, "The building", "id", buildingId);
			}

			if ((buildingData.longitude === 0 && buildingData.latitude === 0) ||
				buildingData.geoJsonData !== existBuilding.geoJsonData
			) {
				const geojsonObj = JSON.parse(buildingData.geoJsonData);
				let geoPolygon;
				if (geojsonObj.features[0].geometry.type === "Polygon") {
					geoPolygon = polygon(geojsonObj.features[0].geometry.coordinates);
				} else if (geojsonObj.features[0].geometry.type === "MultiPolygon") {
					geoPolygon = polygon(geojsonObj.features[0].geometry.coordinates[0]);
				}
				const center = pointOnFeature(geoPolygon);
				buildingData.longitude = center.geometry.coordinates[0];
				buildingData.latitude = center.geometry.coordinates[1];
			}
			const updatedBuilding = { ...existBuilding, ...buildingData };
			updatedBuilding.outerBounds = findBuildingBounds(updatedBuilding.geoJsonData);
			const response = await updateBuildingById(parseInt(buildingId, 10), updatedBuilding);
			if (!response) throw new HttpException(req, res, 500, "The building could not be updated");
			const message = { message: `Building updated succesfully.` }
			infoLogger(req, res, 200, message.message);
			res.status(200).send(message);
		} catch (error) {
			next(error);
		}
	};

	private deleteBuildingById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
		try {
			const { buildingId } = req.params;
			const existBuilding = await getBuildingByProp("id", buildingId);
			if (!existBuilding) {
				throw new ItemNotFoundException(req, res, "The building", "id", buildingId);
			}
			if (existBuilding.id === 1) {
				throw new HttpException(req, res, 500, "The plattorm default building can not be deleted");
			}
			const response = await deleteBuildingById(parseInt(buildingId, 10));
			if (!response) throw new HttpException(req, res, 500, "The building could not be deleted");
			const message = { message: `Building deleted succesfully` }
			res.status(200).json(message);
		} catch (error) {
			next(error);
		}
	};


}

export default BuildingController;
