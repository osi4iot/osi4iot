// The Canvas of the slides of a digital twin's Viewer: a whiteboard (Excalidraw) behind the panels of its slide. Its
// scene (elements, the pictures pasted in it as data URLs, how it looks) is one JSON in S3, under the slide's id:
//
//   org_data/org_<org>/group_<group>/digitalTwin_<dt>/slides/<slideId>/canvas/scene.json
//
// The group's viewers read it, its editors write it. The layout says which slides have a canvas (slide.canvas): when
// it is saved without a slide's canvas (or without the slide) the scene goes (removedCanvasSlides); a duplicated slide
// gets a copy (copySlideFiles copies the folder).
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import process_env from "../../config/api_config";
import s3Client from "../../config/s3Config";
import { IViewerLayout } from "../viewerLayout/viewerLayoutValidation";
import IDigitalTwin from "./digitalTwin.interface";
import { FIRST_SLIDE_ID, SLIDE_ID, listObjects, modelKeyBase, removePrefix, twinKeyBase } from "./slideModels";

export const CANVAS_FOLDER = "canvas";
export const CANVAS_FILE = "scene.json";
// a scene with its pictures
export const CANVAS_MAX_BYTES = 50 * 1024 * 1024;
export const CANVAS_MAX_ELEMENTS = 20000;

type Twin = Pick<IDigitalTwin, "orgId" | "groupId" | "id">;

export const canvasKey = (digitalTwin: Twin, slideId: string): string => `${modelKeyBase(digitalTwin, slideId)}/${CANVAS_FOLDER}/${CANVAS_FILE}`;

// what is wrong with a scene (null: nothing): an object with its elements, and the pictures they use
export const canvasSceneProblem = (scene: unknown): string | null => {
	if (!scene || typeof scene !== "object" || Array.isArray(scene)) return "The scene must be an object";
	const s = scene as Record<string, unknown>;
	if (!Array.isArray(s.elements)) return "The scene needs its list of elements";
	if (s.elements.length > CANVAS_MAX_ELEMENTS) return `At most ${CANVAS_MAX_ELEMENTS} elements`;
	if (s.elements.some((e) => !e || typeof e !== "object" || Array.isArray(e))) return "Each element must be an object";
	if (s.files !== undefined && (!s.files || typeof s.files !== "object" || Array.isArray(s.files))) return "The files must be an object";
	if (s.appState !== undefined && (!s.appState || typeof s.appState !== "object" || Array.isArray(s.appState))) return "The appState must be an object";
	return null;
};

export const getSlideCanvas = async (digitalTwin: Twin, slideId: string): Promise<string | null> => {
	try {
		const data = await s3Client.send(new GetObjectCommand({ Bucket: process_env.S3_BUCKET_NAME, Key: canvasKey(digitalTwin, slideId) }));
		return (await data.Body?.transformToString("utf-8")) ?? null;
	} catch (error) {
		const name = (error as { name?: string })?.name;
		if (name === "NoSuchKey" || name === "NotFound") return null;
		throw error;
	}
};

export const putSlideCanvas = async (digitalTwin: Twin, slideId: string, json: string): Promise<void> => {
	await s3Client.send(
		new PutObjectCommand({
			Bucket: process_env.S3_BUCKET_NAME,
			Key: canvasKey(digitalTwin, slideId),
			Body: json,
			ContentType: "application/json",
		})
	);
};

// the slides that have a scene
export const getCanvasSlides = async (digitalTwin: Twin): Promise<string[]> => {
	const prefix = `${twinKeyBase(digitalTwin)}/slides/`;
	const slides = new Set<string>();
	for (const o of await listObjects(`${twinKeyBase(digitalTwin)}/slides`)) {
		const [slideId, folder, file] = o.key.slice(prefix.length).split("/");
		if (SLIDE_ID.test(slideId) && folder === CANVAS_FOLDER && file === CANVAS_FILE) slides.add(slideId);
	}
	return [...slides].sort();
};

const canvasSlides = (layout: IViewerLayout | null | undefined): Set<string> =>
	new Set((layout?.slides ?? []).filter((s) => !!s.canvas).map((s) => s.id));

// The slides whose scene goes when the group's layout becomes `next` (null: the automatic one, which has none): those
// of `stored` that are not in `next`, or whose canvas `next` does not have. A scene written while the layout is edited
// (its canvas not saved yet) is not removed while that slide had no canvas before either: it may be saved later.
export const removedCanvasSlides = (previous: IViewerLayout | null, next: IViewerLayout | null, stored: string[]): string[] => {
	const nextIds = new Set(next ? next.slides.map((s) => s.id) : [FIRST_SLIDE_ID]);
	const before = canvasSlides(previous);
	const after = canvasSlides(next);
	return stored.filter((id) => !nextIds.has(id) || (before.has(id) && !after.has(id)));
};

export const removeSlideCanvas = async (digitalTwin: Twin, slideIds: string[]): Promise<void> => {
	for (const id of slideIds.filter((s) => SLIDE_ID.test(s))) await removePrefix(`${modelKeyBase(digitalTwin, id)}/${CANVAS_FOLDER}`);
};
