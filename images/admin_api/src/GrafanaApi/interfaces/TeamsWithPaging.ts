import ITeam from "./Team";

export default interface ITeamsWithPaging {
	totalCount: number,
	teams: ITeam[],
	page: number,
	perPage: number,
}