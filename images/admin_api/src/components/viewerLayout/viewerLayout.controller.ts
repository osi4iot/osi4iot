// The layout of the Viewer page of a digital twin, the same for the whole group:
//
//   GET    /viewer_layout/:groupId/:digitalTwinId   { layout, updatedBy, updatedAt } or { layout: null }
//                                                   (null: the frontend builds the automatic layout)
//   PUT    /viewer_layout/:groupId/:digitalTwinId   body { layout }: saves it (group administrators)
//   DELETE /viewer_layout/:groupId/:digitalTwinId   back to the automatic layout (group administrators)
//
// Saving (or going back to the automatic layout) removes the files of the 3D models of the slides it no longer has,
// or whose 3D Model panel it no longer has (slideModels.ts): the answer names them (removedSlideModels).
//
// The viewer itself (digital_twin_data) is opened by group administrators, so reading needs the same rights.
import { Router, NextFunction, Response } from "express";
import IController from "../../interfaces/controller.interface";
import digitalTwinAndGroupExist from "../../middleware/digitalTwinAndGroupExist.middleware";
import { groupViewerAuth, groupEditorAuth } from "../../middleware/auth.middleware";
import IRequestWithDigitalTwinAndGroup from "../group/interfaces/requestWithDigitalTwinAndGroup.interface";
import HttpException from "../../exceptions/HttpException";
import { deleteViewerLayout, getViewerLayout, saveViewerLayout } from "./viewerLayoutDAL";
import { IViewerLayout } from "./viewerLayoutValidation";
import { getSlideModels, removedModelSlides, removeSlideFiles } from "../digitalTwin/slideModels";
import { refreshTopicsMessageSchema, topicIdsOfDigitalTwin } from "../topic/messageSchema";
import { validateViewerLayout } from "./viewerLayoutValidation";

type Req = IRequestWithDigitalTwinAndGroup & { user?: { login?: string; name?: string; email?: string } };

class ViewerLayoutController implements IController {
	public path = "/viewer_layout";

	public router = Router();

	constructor() {
		this.initializeRoutes();
	}

	private initializeRoutes(): void {
		this.router
			.get(`${this.path}/:groupId/:digitalTwinId`, digitalTwinAndGroupExist, groupViewerAuth, this.getLayout)
			.put(`${this.path}/:groupId/:digitalTwinId`, digitalTwinAndGroupExist, groupEditorAuth, this.saveLayout)
			.delete(`${this.path}/:groupId/:digitalTwinId`, digitalTwinAndGroupExist, groupEditorAuth, this.deleteLayout);
	}

	// the twin must belong to the group of the URL
	private checkTwinOfGroup = (req: Req, res: Response): void => {
		if (Number(req.digitalTwin.groupId) !== Number(req.group.id)) {
			throw new HttpException(req, res, 404, "The digital twin does not belong to this group");
		}
	};

	// The files of the slides' 3D models that the layout no longer has (a slide removed, or its 3D Model panel;
	// slideModels.ts, removedModelSlides): removed once the layout is saved. The slides removed.
	private removeModelsOfLayout = async (req: Req, previous: IViewerLayout | null, next: IViewerLayout | null): Promise<string[]> => {
		const stored = Object.keys(await getSlideModels(req.digitalTwin));
		const removed = removedModelSlides(previous, next, stored);
		await removeSlideFiles(req.digitalTwin, removed);
		return removed;
	};

	private getLayout = async (req: Req, res: Response, next: NextFunction): Promise<void> => {
		try {
			this.checkTwinOfGroup(req, res);
			const row = await getViewerLayout(Number(req.group.id), Number(req.digitalTwin.id));
			res.status(200).send(row ?? { layout: null });
		} catch (error) {
			next(error);
		}
	};

	private saveLayout = async (req: Req, res: Response, next: NextFunction): Promise<void> => {
		try {
			this.checkTwinOfGroup(req, res);
			const layout = validateViewerLayout(req.body?.layout);
			if (typeof layout === "string") throw new HttpException(req, res, 400, layout);
			const user: { login?: string; name?: string; email?: string } = req.user ?? {};
			const previous = (await getViewerLayout(Number(req.group.id), Number(req.digitalTwin.id)))?.layout ?? null;
			const row = await saveViewerLayout(
				Number(req.group.id),
				Number(req.digitalTwin.id),
				layout,
				user.login || user.name || user.email || ""
			);
			const removedSlideModels = await this.removeModelsOfLayout(req, previous, layout);
			// the simulators of the slides may have their own formats: the schemas of sim2dtm and dtm2sim follow them
			await refreshTopicsMessageSchema(await topicIdsOfDigitalTwin(Number(req.digitalTwin.id)));
			res.status(200).send({
				...row,
				removedSlideModels,
				message: `The layout of the viewer of ${req.digitalTwin.digitalTwinUid} has been saved for the group`,
			});
		} catch (error) {
			next(error);
		}
	};

	private deleteLayout = async (req: Req, res: Response, next: NextFunction): Promise<void> => {
		try {
			this.checkTwinOfGroup(req, res);
			const previous = (await getViewerLayout(Number(req.group.id), Number(req.digitalTwin.id)))?.layout ?? null;
			await deleteViewerLayout(Number(req.group.id), Number(req.digitalTwin.id));
			const removedSlideModels = await this.removeModelsOfLayout(req, previous, null);
			await refreshTopicsMessageSchema(await topicIdsOfDigitalTwin(Number(req.digitalTwin.id)));
			res.status(200).send({ layout: null, removedSlideModels, message: "The viewer is back to the automatic layout" });
		} catch (error) {
			next(error);
		}
	};
}

export default ViewerLayoutController;
