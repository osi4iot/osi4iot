export default interface IAlert {
	id?: number;
	version: number;
	dashboardId: number;
	panelId: number;
	orgId: number;
	name: string;
	message: string;
	state: string;
	settings: any;
	frequency: number;
	handler: number;
	severity: string;
	silenced: boolean;
	executionError: string;
	evalData: string;
	evalDate: string;
	newStateDate: string;
	stateChanges: number;
	created: string;
	updated: string;
	for: number;
}