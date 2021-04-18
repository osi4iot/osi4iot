import IOrganization from "../organization/interfaces/organization.interface";
import IGroup from "../group/interfaces/Group.interface";
import IDevice from "../device/device.interface";

export default interface IPlatformComponents {
	organizations: IOrganization[];
	groups: IGroup[];
	devices: IDevice[];
};