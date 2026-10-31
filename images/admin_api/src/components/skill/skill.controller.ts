import { Router, NextFunction, Request, Response } from "express";
import IController from "../../interfaces/controller.interface";
import groupExists from "../../middleware/groupExists.middleware";
import { groupAdminAuth, superAdminAuth, userAuth } from "../../middleware/auth.middleware";
import HttpException from "../../exceptions/HttpException";
import IRequestWithGroup from "../group/interfaces/requestWithGroup.interface";
import infoLogger from "../../utils/logger/infoLogger";
import {
	AI_AGENT_MCP_SERVERS,
	SkillFormatError,
	SkillScope,
	isValidSkillName,
	skillNameRule,
	skillRef,
	validateSkillFiles,
} from "./skillFormat";
import { isBuiltinSkill } from "./builtinSkills";
import {
	deleteSkill,
	findSkillUses,
	groupSkillsFolder,
	listSkills,
	platformSkillsFolder,
	readSkillFiles,
	skillExists,
	writeSkillFiles,
} from "./skillStorage";

// Skills of the AI agents (see skillFormat.ts and skillStorage.ts): the
// platform's, managed by the platform administrators, and each group's,
// managed by its administrators. An AiAgent node chooses which ones its
// agent has (setting "skills": ["platform:<name>", "group:<name>"]) and
// which MCP servers (setting "mcpServers").
//
// A skill is sent and returned whole, as { files: { path: content } }:
// the frontend's editor and its zip upload both produce that. pipelines
// notices a changed skill by itself (it compares the files' ETags before
// each prompt), so nothing is published to it.
//
//   GET    /ai_agent_mcp_servers                     the MCP servers a node can choose
//   GET    /platform_skills                          platform skills
//   GET    /platform_skill/:skillName                one, with its files
//   PUT    /platform_skill/:skillName                create or replace
//   DELETE /platform_skill/:skillName[?force=true]   409 while nodes use it, unless forced
//   GET    /group_skills/:groupId                    the group's skills
//   GET    /group_skill/:groupId/:skillName
//   PUT    /group_skill/:groupId/:skillName
//   DELETE /group_skill/:groupId/:skillName[?force=true]
//   GET    /group_available_skills/:groupId          platform + group skills and the
//                                                    MCP servers, for the node editor
//   GET    /group_platform_skill/:groupId/:skillName a platform skill's files, for a
//                                                    group admin to view or duplicate it
//
// The built-in skills (builtinSkills.ts) are platform skills that cannot
// be changed or deleted (403): they are duplicated to be adapted.
class SkillController implements IController {
	public path = "";

	public router = Router();

	constructor() {
		this.initializeRoutes();
	}

	private initializeRoutes(): void {
		this.router
			.get("/ai_agent_mcp_servers", userAuth, this.getMcpServers)
			.get("/platform_skills", superAdminAuth, this.getPlatformSkills)
			.get("/platform_skill/:skillName", superAdminAuth, validSkillName, this.getPlatformSkill)
			.put("/platform_skill/:skillName", superAdminAuth, validSkillName, notBuiltin, this.putPlatformSkill)
			.delete("/platform_skill/:skillName", superAdminAuth, validSkillName, notBuiltin, this.deletePlatformSkill)
			.get("/group_skills/:groupId", groupExists, groupAdminAuth, this.getGroupSkills)
			.get("/group_skill/:groupId/:skillName", groupExists, groupAdminAuth, validSkillName, this.getGroupSkill)
			.put("/group_skill/:groupId/:skillName", groupExists, groupAdminAuth, validSkillName, this.putGroupSkill)
			.delete(
				"/group_skill/:groupId/:skillName",
				groupExists,
				groupAdminAuth,
				validSkillName,
				this.deleteGroupSkill
			)
			.get("/group_available_skills/:groupId", groupExists, groupAdminAuth, this.getGroupAvailableSkills)
			.get(
				"/group_platform_skill/:groupId/:skillName",
				groupExists,
				groupAdminAuth,
				validSkillName,
				this.getPlatformSkill
			);
	}

	private getMcpServers = (req: Request, res: Response): void => {
		res.status(200).send(AI_AGENT_MCP_SERVERS);
	};

	// ---- platform ----

	private getPlatformSkills = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
		try {
			res.status(200).send(await listSkills(platformSkillsFolder(), "platform"));
		} catch (error) {
			next(error);
		}
	};

	private getPlatformSkill = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
		await this.sendSkill(req, res, next, platformSkillsFolder());
	};

	private putPlatformSkill = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
		await this.saveSkill(req, res, next, platformSkillsFolder(), "platform");
	};

	private deletePlatformSkill = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
		await this.removeSkill(req, res, next, platformSkillsFolder(), "platform");
	};

	// ---- group ----

	private getGroupSkills = async (req: IRequestWithGroup, res: Response, next: NextFunction): Promise<void> => {
		try {
			res.status(200).send(await listSkills(groupSkillsFolder(req.group.orgId, req.group.id), "group"));
		} catch (error) {
			next(error);
		}
	};

	private getGroupSkill = async (req: IRequestWithGroup, res: Response, next: NextFunction): Promise<void> => {
		await this.sendSkill(req, res, next, groupSkillsFolder(req.group.orgId, req.group.id));
	};

	private putGroupSkill = async (req: IRequestWithGroup, res: Response, next: NextFunction): Promise<void> => {
		// The agent knows a skill by its name only: a group skill named as a
		// platform skill could not be told apart from it.
		try {
			if (await skillExists(platformSkillsFolder(), req.params.skillName)) {
				throw new HttpException(
					req,
					res,
					409,
					`There is a platform skill named '${req.params.skillName}': give the group's skill another name`
				);
			}
		} catch (error) {
			return next(error);
		}
		await this.saveSkill(req, res, next, groupSkillsFolder(req.group.orgId, req.group.id), "group", req.group.id);
	};

	private deleteGroupSkill = async (req: IRequestWithGroup, res: Response, next: NextFunction): Promise<void> => {
		await this.removeSkill(req, res, next, groupSkillsFolder(req.group.orgId, req.group.id), "group", req.group.id);
	};

	private getGroupAvailableSkills = async (
		req: IRequestWithGroup,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const [platform, group] = await Promise.all([
				listSkills(platformSkillsFolder(), "platform"),
				listSkills(groupSkillsFolder(req.group.orgId, req.group.id), "group"),
			]);
			res.status(200).send({ skills: [...platform, ...group], mcpServers: AI_AGENT_MCP_SERVERS });
		} catch (error) {
			next(error);
		}
	};

	// ---- common ----

	private sendSkill = async (req: Request, res: Response, next: NextFunction, folder: string): Promise<void> => {
		const { skillName } = req.params;
		try {
			const files = await readSkillFiles(folder, skillName);
			if (!files) throw new HttpException(req, res, 404, `There is no skill named '${skillName}'`);
			res.status(200).send({ name: skillName, files });
		} catch (error) {
			next(error);
		}
	};

	private saveSkill = async (
		req: Request,
		res: Response,
		next: NextFunction,
		folder: string,
		scope: SkillScope,
		groupId?: number
	): Promise<void> => {
		const { skillName } = req.params;
		try {
			let validated: ReturnType<typeof validateSkillFiles>;
			try {
				validated = validateSkillFiles(skillName, (req.body as { files?: unknown })?.files);
			} catch (err) {
				if (err instanceof SkillFormatError) throw new HttpException(req, res, 400, err.message);
				throw err;
			}
			const existed = await skillExists(folder, skillName);
			await writeSkillFiles(folder, skillName, validated.files);
			const where = scope === "platform" ? "the platform" : `group ${groupId}`;
			const message = `The skill '${skillName}' of ${where} has been ${existed ? "updated" : "created"}`;
			infoLogger(req, res, 200, message);
			res.status(200).send({ message, ref: skillRef(scope, skillName), frontmatter: validated.frontmatter });
		} catch (error) {
			next(error);
		}
	};

	// While AiAgent nodes use the skill it is not deleted unless forced
	// (?force=true): the answer lists them. A node keeps the reference
	// after a forced delete; pipelines skips a skill it cannot find, with
	// a warning in the log.
	private removeSkill = async (
		req: Request,
		res: Response,
		next: NextFunction,
		folder: string,
		scope: SkillScope,
		groupId?: number
	): Promise<void> => {
		const { skillName } = req.params;
		try {
			if (!(await skillExists(folder, skillName))) {
				throw new HttpException(req, res, 404, `There is no skill named '${skillName}'`);
			}
			const uses = await findSkillUses(skillRef(scope, skillName), groupId);
			if (uses.length !== 0 && req.query.force !== "true") {
				res.status(409).send({
					message: `The skill '${skillName}' is used by ${uses.length} AI agent node(s)`,
					usedBy: uses,
				});
				return;
			}
			await deleteSkill(folder, skillName);
			const message = `The skill '${skillName}' has been deleted`;
			infoLogger(req, res, 200, message);
			res.status(200).send({ message, usedBy: uses });
		} catch (error) {
			next(error);
		}
	};
}

// The built-in skills are read-only: they are duplicated to be adapted.
const notBuiltin = (req: Request, res: Response, next: NextFunction): void => {
	if (isBuiltinSkill(req.params.skillName)) {
		return next(
			new HttpException(
				req,
				res,
				403,
				`'${req.params.skillName}' is a built-in skill of the platform: it cannot be changed or deleted. Duplicate it to adapt it.`
			)
		);
	}
	next();
};

const validSkillName = (req: Request, res: Response, next: NextFunction): void => {
	if (!isValidSkillName(req.params.skillName)) {
		return next(new HttpException(req, res, 400, `Invalid skill name: ${skillNameRule}`));
	}
	next();
};

export default SkillController;