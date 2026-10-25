import { IAsset } from "../TableColumns/assetsColumns";
import { IAssetType } from "../TableColumns/assetTypesColumns";
import { ISensor } from "../TableColumns/sensorsColumns";
import { ISensorType } from "../TableColumns/sensorTypesColumns";

// The type of a sensor or an asset, by its id. Not by its name: type names
// are per organization, so several organizations have types with the same
// name (each its own copy of the predefined ones), and the first one with
// the name may be another organization's, with another icon. Every sensor
// and asset has a type (foreign key), and the types of the organizations
// the user manages are all loaded.

export const findSensorType = (sensorTypes: ISensorType[], sensor: ISensor): ISensorType =>
    sensorTypes.find((sensorType) => sensorType.id === sensor.sensorTypeId) as ISensorType;

export const findAssetType = (assetTypes: IAssetType[], asset: IAsset): IAssetType =>
    assetTypes.find((assetType) => assetType.id === asset.assetTypeId) as IAssetType;
