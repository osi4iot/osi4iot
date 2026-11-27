// The position of an asset that moves (its type's geolocation mode is "dynamic") for the map: the last one kept in
// its state (iot_data.assetState, section geolocation, written by the AssetState node of its pipeline), or null
// (the map then uses the asset's own position, grafanadb.asset); and the NATS subjects of its geolocation sensors
// ("Mobile geolocation", "Geolocation"), whose messages move its marker live.
export default interface IGeolocationMeasurement {
	timestamp: string | null;
	assetUid: string;
	longitude: number | null;
	latitude: number | null;
	natsSubjects: string[];
}