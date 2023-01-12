import IOrgTreeNodeParent from "./organizationTreeNodeParent.interface";
import IInstitutionWithoutDate from "./organizationWithoutDate.interface";


interface IOrgTreeNodeOutput {
	id: string;
	name: string;
	acronym: string;
	description: string;
	parent: IOrgTreeNodeParent;
	institution: IInstitutionWithoutDate;
}

export default IOrgTreeNodeOutput;
