import { Router, NextFunction, Request, Response } from "express";
import IController from "../../interfaces/controller.interface";
import groupExists from "../../middleware/groupExists.middleware";
import organizationExists from "../../middleware/organizationExists.middleware";
import { groupAdminAuth, superAdminAuth } from "../../middleware/auth.middleware";
import IRequestWithGroup from "../group/interfaces/requestWithGroup.interface";
import IRequestWithOrganization from "./interfaces/requestWithOrganization.interface";
import { getOrganizationFullInfoByProp } from "./organizationDAL";
import { getAllowedLlmModels, getProviderLlmModels, previewProviderLlmModels } from "./llmModels";
import { decrypt } from "../../utils/encryptAndDecrypt/encryptAndDecrypt";
import ItemNotFoundException from "../../exceptions/ItemNotFoundException";

// The LLM models that can be chosen in the AI nodes, asked to the
// organization's provider here because its API key must not reach the
// browser.
//
//   GET /organization_llm_models/:orgId[?refresh=true]
//       Everything the provider offers, for the platform admin choosing
//       the organization's allowed models.
//   POST /organization_llm_models_preview
//       The same, with the provider settings of the organization forms
//       before they are saved: { llmProviderType, llmProviderUrl,
//       llmProviderApiKey?, orgId? }. Without an API key, the one saved
//       for orgId (when editing an organization) is used.
//   GET /group_llm_models/:groupId[?refresh=true]
//       The models the group's pipelines may use: the allowed ones, or
//       all when the organization allows all.
class LlmModelsController implements IController {
	public path = "";

	public router = Router();

	constructor() {
		this.initializeRoutes();
	}

	private initializeRoutes(): void {
		this.router
			.get("/organization_llm_models/:orgId", organizationExists, superAdminAuth, this.getOrganizationLlmModels)
			.post("/organization_llm_models_preview", superAdminAuth, this.previewLlmModels)
			.get("/group_llm_models/:groupId", groupExists, groupAdminAuth, this.getGroupLlmModels);
	}

	private getOrganizationLlmModels = async (
		req: IRequestWithOrganization,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const org = await getOrganizationFullInfoByProp("id", req.organization.id);
			if (!org) throw new ItemNotFoundException(req, res, "The organization", "id", String(req.organization.id));
			const list = await getProviderLlmModels(org, req.query.refresh === "true");
			res.status(200).send({ ...list, allowedModels: org.llmAllowedModels || [] });
		} catch (error) {
			next(error);
		}
	};

	private previewLlmModels = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
		try {
			const body = (req.body || {}) as {
				llmProviderType?: unknown;
				llmProviderUrl?: unknown;
				llmProviderApiKey?: unknown;
				orgId?: unknown;
			};
			const asString = (v: unknown): string => (typeof v === "string" ? v : "");
			let apiKey = asString(body.llmProviderApiKey).trim();
			const orgId = Number(body.orgId);
			if (apiKey === "" && Number.isInteger(orgId) && orgId > 0) {
				const org = await getOrganizationFullInfoByProp("id", orgId);
				if (org?.hashedLlmProviderApiKey) apiKey = decrypt(org.hashedLlmProviderApiKey);
			}
			const list = await previewProviderLlmModels(
				asString(body.llmProviderType),
				asString(body.llmProviderUrl),
				apiKey
			);
			res.status(200).send(list);
		} catch (error) {
			next(error);
		}
	};

	private getGroupLlmModels = async (req: IRequestWithGroup, res: Response, next: NextFunction): Promise<void> => {
		try {
			const org = await getOrganizationFullInfoByProp("id", req.group.orgId);
			if (!org) throw new ItemNotFoundException(req, res, "The organization", "id", String(req.group.orgId));
			if (req.query.refresh === "true") await getProviderLlmModels(org, true);
			const list = await getAllowedLlmModels(org);
			res.status(200).send(list);
		} catch (error) {
			next(error);
		}
	};
}

export default LlmModelsController;
