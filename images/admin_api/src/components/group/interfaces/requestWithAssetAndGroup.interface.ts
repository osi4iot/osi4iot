import { Request } from "express";
import IGroup from "./Group.interface";
import IAsset from "../../asset/asset.interface";

interface IRequestWithAssetAndGroup extends Request {
	asset: IAsset
	group: IGroup;
}

export default IRequestWithAssetAndGroup;
