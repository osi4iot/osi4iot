import jwt from 'jsonwebtoken';
import process_env from '../../config/api_config';
import { haveThisUserGroupAdminPermissions } from '../../components/group/groupDAL';
import { getUserByProp } from '../../components/user/userDAL';
import IGroup from '../../components/group/interfaces/Group.interface';

export const generateS3StorageToken = (
	userId: number,
	groupId: number,
	assetId: number,
	s3FolderName: string,
	year: string,
) => {
	const payload = {
		userId,
		groupId,
		assetId,
		s3FolderName,
		year,
	}
	const token = jwt.sign(payload, process_env.ACCESS_TOKEN_SECRET, { expiresIn: '300s' });
	return { token };
}

interface IS3StoragePayload extends jwt.JwtPayload {
	userId: number;
	groupId: number;
	assetId: number;
	s3FolderName: string;
	year: string;
}

export const isS3StorageTokenValid = async (
	group: IGroup,
	assetId: string,
	s3FolderName: string,
	year: string,
	token: string
) => {
	if (token == null) return false;
	try {
		const decoded = jwt.verify(token, process_env.TOKEN_SECRET as string) as IS3StoragePayload;
		const user = await getUserByProp("id", decoded.userId);
		if (!user) return false;
		if (group.id !== decoded.groupId ||
			parseInt(assetId, 10) !== decoded.assetId ||
			s3FolderName !== decoded.s3FolderName ||
			year !== decoded.year
		) return false;
		const orgId = group.orgId;
		const teamId = group.teamId;
		let isGroupAdmin = await haveThisUserGroupAdminPermissions(user.id, teamId, orgId);
		if (user.isGrafanaAdmin) isGroupAdmin = true;
		if (!isGroupAdmin) return false;
		return true;
	} catch (err) {
		return false;
	}
}