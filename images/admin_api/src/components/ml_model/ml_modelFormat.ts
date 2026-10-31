import { NextFunction, Request, Response } from "express";
import HttpException from "../../exceptions/HttpException";

// The pipelines run the ML models with ONNX Runtime (Mlm node): a model is
// one .onnx file, so there is no library to choose. Models trained with
// TensorFlow/Keras, scikit-learn or PyTorch are exported to ONNX before
// they are uploaded.

// The file name in the upload URL is the object's name in the bucket: a
// plain name (no folders, nothing hidden) ending in .onnx.
export const validOnnxFileName = (req: Request, res: Response, next: NextFunction): void => {
	const { fileName } = req.params;
	const valid =
		typeof fileName === "string" &&
		fileName.length <= 200 &&
		!/[/\\]/.test(fileName) &&
		!fileName.startsWith(".") &&
		!fileName.includes("..") &&
		/\.onnx$/i.test(fileName);
	if (!valid) {
		return next(new HttpException(req, res, 400, "Upload the model as one .onnx file with a plain file name"));
	}
	next();
};
