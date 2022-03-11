import { deleteDeviceByProp } from "../components/device/deviceDAL";
import CreateMasterDeviceDto from "../components/masterDevice/masterDevice.dto";
import {
	createMasterDevice,
	deleteMasterDeviceById,
	getAllMasterDevices,
	updateMasterDeviceHashById
} from "../components/masterDevice/masterDeviceDAL";
import { getOrganizations, updateOrganizationHashById } from "../components/organization/organizationDAL";
import process_env from "../config/api_config";
import { logger } from "../config/winston";

export const updateOrganizationHashes = async () => {
	const organizations = await getOrganizations();
	const masterDevices = await getAllMasterDevices();

	const masterDeviceToCreateQuerries = [];
	const masterDeviceToUpdateQuerries = [];
	const masterDeviceToRemoveQuerries = [];
	const deviceToRemoveQuerries = [];
	const orgHashesUpdateQuerries = [];

	for (const organization of organizations) {
		const orgId = organization.id;
		const orgMasterDeviceHashes = process_env.MASTER_DEVICE_HASHES[orgId - 1];
		const masterDevicesInExistingOrg = masterDevices.filter(masterDevice => masterDevice.orgId === orgId);
		masterDevicesInExistingOrg.sort((a, b) => {
			return a.id - b.id;
		});
		for (let imdev = 0; imdev < orgMasterDeviceHashes.length; imdev++) {
			if (masterDevicesInExistingOrg[imdev] !== undefined &&
				masterDevicesInExistingOrg[imdev].masterDeviceHash !== orgMasterDeviceHashes[imdev]
			) {
				if (masterDevicesInExistingOrg[imdev] !== undefined) {
					const masterDeviceId = masterDevicesInExistingOrg[imdev].id;
					const newMDHash = orgMasterDeviceHashes[imdev];
					masterDeviceToUpdateQuerries.push(updateMasterDeviceHashById(masterDeviceId, newMDHash));
				}
			}
		}

		if (orgMasterDeviceHashes.length < masterDevicesInExistingOrg.length) {
			for (let imdev = orgMasterDeviceHashes.length; imdev < masterDevicesInExistingOrg.length; imdev++) {
				const masterDevice = masterDevicesInExistingOrg[imdev];
				masterDeviceToRemoveQuerries.push(deleteMasterDeviceById(masterDevice.id));
				if (masterDevice.deviceId) {
					deviceToRemoveQuerries.push(deleteDeviceByProp("id", masterDevice.deviceId));
				}
			}

		} else if (orgMasterDeviceHashes.length > masterDevicesInExistingOrg.length) {
			for (let imdev = masterDevicesInExistingOrg.length; imdev < orgMasterDeviceHashes.length; imdev++) {
				const masterDeviceHash = orgMasterDeviceHashes[imdev];
				const masterDeviceInput: CreateMasterDeviceDto = {
					masterDeviceHash,
					orgId
				}
				masterDeviceToCreateQuerries.push(createMasterDevice(masterDeviceInput));
			}
		}

		if (organization.orgHash !== process_env.ORG_HASHES[orgId - 1]) {
			orgHashesUpdateQuerries.push(updateOrganizationHashById(organization.id, process_env.ORG_HASHES[orgId - 1] ))
		}
	}

	if (masterDeviceToCreateQuerries.length !== 0) {
		try {
			await Promise.all(masterDeviceToCreateQuerries);
			logger.log("info", `New master devices have been created sucessfully`);
		} catch (err) {
			logger.log("error", `New master devices could not be created: %s`, err.message);
		}
	}
	if (masterDeviceToUpdateQuerries.length !== 0) {
		try {
			await Promise.all(masterDeviceToUpdateQuerries);
			logger.log("info", `Master devices have been updated sucessfully`);
		} catch (err) {
			logger.log("error", `Unused master devices could not be updated: %s`, err.message);
		}
	}
	if (masterDeviceToRemoveQuerries.length !== 0) {
		try {
			await Promise.all(masterDeviceToRemoveQuerries);
			logger.log("info", `Unused master devices have been removed sucessfully`);
		} catch (err) {
			logger.log("error", `Unused master devices could not be removed: %s`, err.message);
		}
	}
	if (deviceToRemoveQuerries.length !== 0) {
		try {
			await Promise.all(deviceToRemoveQuerries);
			logger.log("info", `Unused devices have been removed sucessfully`);
		} catch (err) {
			logger.log("error", `Unused devices could not be removed: %s`, err.message);
		}
	}
	if (orgHashesUpdateQuerries.length !== 0) {
		try {
			await Promise.all(orgHashesUpdateQuerries);
			logger.log("info", `Organization hashes has been updated sucessfully`);
		} catch (err) {
			logger.log("error", `Organization hashes could not be updated: %s`, err.message);
		}
	}
}