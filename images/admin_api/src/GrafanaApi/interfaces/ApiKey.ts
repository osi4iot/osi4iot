// The token of an organization's service account (Grafana >= 12 has no
// API keys): the key to use as Bearer token, and its id (grafanadb.api_key,
// where Grafana keeps the service account tokens).
export default interface IApiKey {
	id: number;
	name: string;
	key: string;
}