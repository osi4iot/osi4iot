// Tablas que la plataforma pide al servidor: URL de cada una y la preparación de los datos que antes hacía
// cada capa (XxxOptions.tsx) antes de guardarlos en PlatformAssistantContext. Las cinco capas aplicaban la
// misma preparación a la misma tabla; solo cambian los edificios y las plantas de la capa del administrador
// de la plataforma, que son todos (el resto de capas ve los de sus grupos gestionados).
import { IBuilding } from "../components/PlatformAssistant/TableColumns/buildingsColumns";
import { IFloor } from "../components/PlatformAssistant/TableColumns/floorsColumns";
import { IGlobalUser } from "../components/PlatformAssistant/TableColumns/globalUsersColumns";
import { IGroupMember } from "../components/PlatformAssistant/TableColumns/groupMemberColumns";
import { IGroup } from "../components/PlatformAssistant/TableColumns/groupsColumns";
import { IGroupManaged } from "../components/PlatformAssistant/TableColumns/groupsManagedColumns";
import { IMembershipInGroups } from "../components/PlatformAssistant/TableColumns/membershipInGroups";
import { IMembershipInOrgs } from "../components/PlatformAssistant/TableColumns/membershipInOrgs";
import { IOrgManaged } from "../components/PlatformAssistant/TableColumns/organizationsManagedColumns";
import { IOrgOfGroupsManaged } from "../components/PlatformAssistant/TableColumns/orgsOfGroupsManagedColumns";
import { IOrgUser } from "../components/PlatformAssistant/TableColumns/orgUsersColumns";
import { IRefreshToken } from "../components/PlatformAssistant/TableColumns/refreshTokensColumns";
import { ISelectOrgUser } from "../components/PlatformAssistant/TableColumns/selectOrgUsersColumns";
import { ITopic } from "../components/PlatformAssistant/TableColumns/topicsColumns";
import { IUserProfile } from "../components/PlatformAssistant/UserOptions/UserProfile";
import { IMlModel } from "../components/PlatformAssistant/TableColumns/mlModelsColumns";
import { IAsset } from "../components/PlatformAssistant/TableColumns/assetsColumns";
import { ISensor } from "../components/PlatformAssistant/TableColumns/sensorsColumns";
import { IAssetType } from "../components/PlatformAssistant/TableColumns/assetTypesColumns";
import { ISensorType } from "../components/PlatformAssistant/TableColumns/sensorTypesColumns";
import IAssetTopic from "../components/PlatformAssistant/TableColumns/assetTopics.interface";
import { IOrganization } from "../components/PlatformAssistant/TableColumns/organizationsColumns";
import IAssetS3Folder from "../components/PlatformAssistant/TableColumns/assetS3FolderColumns";
import { IDashboard } from "../components/PlatformAssistant/TableColumns/dashboardsColumns";
import { IDigitalTwin } from "../components/PlatformAssistant/TableColumns/digitalTwinsColumns";
import elaspsedTimeFormat from "../tools/elapsedTimeFormat";
import { getDTStorageInfo, syncDigitalTwinsLocalStorage } from "../tools/fileSystem";
import { LayerScope } from "./layerScope";

export interface IGeolocationMeasurement {
    assetUid: string;
    longitude: number;
    latitude: number;
    [key: string]: unknown;
}

// Tipo de los datos de cada tabla
export interface TableTypes {
    selectOrgUsers: ISelectOrgUser[];
    organizations: IOrganization[];
    buildings: IBuilding[];
    floors: IFloor[];
    globalUsers: IGlobalUser[];
    refreshTokens: IRefreshToken[];
    orgsManaged: IOrgManaged[];
    orgsOfGroupsManaged: IOrgOfGroupsManaged[];
    orgUsers: IOrgUser[];
    groups: IGroup[];
    groupsManaged: IGroupManaged[];
    groupMembers: IGroupMember[];
    assetTypes: IAssetType[];
    assets: IAsset[];
    lastGeolocations: IGeolocationMeasurement[];
    assetTopics: IAssetTopic[];
    assetS3Folders: IAssetS3Folder[];
    sensorTypes: ISensorType[];
    sensors: ISensor[];
    topics: ITopic[];
    dashboards: IDashboard[];
    digitalTwins: IDigitalTwin[];
    mlModels: IMlModel[];
    userProfile: IUserProfile;
    orgsMembership: IMembershipInOrgs[];
    groupsMembership: IMembershipInGroups[];
}

export type TableName = keyof TableTypes;

interface TableResource<T> {
    // ruta bajo /admin_api/ (puede depender de la capa)
    path: string | ((scope: LayerScope) => string);
    transform?: (data: any) => T | Promise<T>;
}

const formatCreatedUpdated = <R extends { createdAtAge: string; updatedAtAge: string }>(rows: R[]) =>
    rows.map((row) => {
        row.createdAtAge = elaspsedTimeFormat(row.createdAtAge);
        row.updatedAtAge = elaspsedTimeFormat(row.updatedAtAge);
        return row;
    });

const predefinedString = <R extends { isPredefined: boolean; isPredefinedString: string }>(rows: R[]) =>
    rows.map((row) => {
        row.isPredefinedString = row.isPredefined ? "Yes" : "No";
        return row;
    });

const defaultGroupString = <R>(rows: R[]) =>
    rows.map((row: any) => {
        row.isOrgDefaultGroup = row.isOrgDefaultGroup ? "Default" : "Generic";
        return row as R;
    });

const withoutApiAdmin = <R extends { login: string }>(rows: R[]) => rows.filter((user) => user.login.slice(-9) !== "api_admin");

const globalUsersTransform = (data: IGlobalUser[]) =>
    withoutApiAdmin(data).map((user: any) => {
        user.roleInPlatform = user.isGrafanaAdmin ? "Admin" : "";
        user.lastSeenAtAge = elaspsedTimeFormat(user.lastSeenAtAge);
        return user as IGlobalUser;
    });

const assetS3FoldersTransform = (assetS3Folders: IAssetS3Folder[]) => {
    for (const assetS3Folder of assetS3Folders) {
        if (assetS3Folder.lastS3Storage == null) assetS3Folder.lastS3Storage = "-";
        let numDecimals = 2;
        if (assetS3Folder.parquetTotalBytes !== 0) {
            numDecimals = Math.max(2, -Math.log10(assetS3Folder.parquetTotalBytes / 1048576) + 1);
        }
        assetS3Folder.parquetTotalMBytes = (
            assetS3Folder.parquetTotalBytes ? assetS3Folder.parquetTotalBytes / 1048576 : 0
        ).toFixed(numDecimals);
        if ((assetS3Folder.isCurrent as unknown) === true) assetS3Folder.isCurrent = "Yes";
        else if ((assetS3Folder.isCurrent as unknown) === false) assetS3Folder.isCurrent = "No";
    }
    return assetS3Folders;
};

const digitalTwinsTransform = async (digitalTwins: IDigitalTwin[]) => {
    digitalTwins.forEach((dt) => {
        dt.digitalTwinRef = `DT_${dt.digitalTwinUid}`;
        dt.numGltfFilesLocallyStored = 0;
        dt.numFemResFilesLocallyStored = 0;
    });
    await syncDigitalTwinsLocalStorage(digitalTwins);
    const dtStorageInfo = await getDTStorageInfo();
    const digitalTwinUidArray = dtStorageInfo.map((dt) => dt.digitalTwinUid);
    digitalTwins.forEach((dt) => {
        const dtIndex = digitalTwinUidArray.indexOf(dt.digitalTwinUid);
        if (dtIndex !== -1) {
            dt.numGltfFilesLocallyStored = dtStorageInfo[dtIndex].numGltfFiles;
            dt.numFemResFilesLocallyStored = dtStorageInfo[dtIndex].numFemResFiles;
        }
    });
    return digitalTwins;
};

const topicsTransform = (topics: ITopic[]) =>
    topics.map((topic: any) => {
        topic.payloadJsonSchema = JSON.stringify(topic.payloadJsonSchema);
        topic.parquetSchema = JSON.stringify(topic.parquetSchema);
        topic.requireS3StorageString = topic.requireS3Storage ? "yes" : "no";
        return topic as ITopic;
    });

const orgUsersTransform = (data: IOrgUser[]) =>
    withoutApiAdmin(data).map((user: any) => {
        user.lastSeenAtAge = elaspsedTimeFormat(user.lastSeenAtAge);
        return user as IOrgUser;
    });

export const TABLE_RESOURCES: { [K in TableName]: TableResource<TableTypes[K]> } = {
    selectOrgUsers: { path: "organization_users/user_groups_managed/", transform: withoutApiAdmin },
    organizations: { path: "organizations" },
    buildings: {
        path: (scope) => (scope === "admin" ? "buildings" : "buildings/user_groups_managed/"),
        transform: formatCreatedUpdated,
    },
    floors: {
        path: (scope) => (scope === "admin" ? "building_floors" : "building_floors/user_groups_managed/"),
        transform: formatCreatedUpdated,
    },
    globalUsers: { path: "application/global_users", transform: globalUsersTransform },
    refreshTokens: { path: "auth/refresh_tokens", transform: formatCreatedUpdated },
    orgsManaged: { path: "organizations/user_managed/" },
    orgsOfGroupsManaged: { path: "organizations/user_groups_managed/" },
    orgUsers: { path: "organization_users/user_orgs_managed/", transform: orgUsersTransform },
    groups: { path: "groups/user_managed", transform: defaultGroupString },
    groupsManaged: { path: "groups/user_managed", transform: defaultGroupString },
    groupMembers: { path: "group_members/user_managed" },
    assetTypes: { path: "asset_types/user_managed", transform: predefinedString },
    assets: { path: "assets/user_managed" },
    lastGeolocations: { path: "measurement_last_of_assets_geolocation/user_managed/" },
    assetTopics: { path: "asset_topics/user_managed" },
    assetS3Folders: { path: "asset_s3_folders_with_history/user_managed", transform: assetS3FoldersTransform },
    sensorTypes: { path: "sensor_types/user_managed", transform: predefinedString },
    sensors: { path: "sensors/user_managed" },
    topics: { path: "topics/user_managed", transform: topicsTransform },
    dashboards: { path: "dashboards/user_managed/" },
    digitalTwins: { path: "digital_twins/user_managed", transform: digitalTwinsTransform },
    mlModels: { path: "ml_models/user_managed" },
    userProfile: { path: "auth/user_profile" },
    orgsMembership: { path: "organizations/which_the_logged_user_is_user/" },
    groupsMembership: { path: "groups/which_the_logged_user_is_member/" },
};

export const INITIAL_USER_PROFILE: IUserProfile = {
    userId: 0,
    name: "",
    firstName: "",
    surname: "",
    login: "",
    email: "",
} as IUserProfile;

export const tablePath = (name: TableName, scope: LayerScope) => {
    const path = TABLE_RESOURCES[name].path;
    return typeof path === "function" ? path(scope) : path;
};
