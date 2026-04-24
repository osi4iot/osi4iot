declare module "@turf/point-on-feature" {
	import { Feature, Point, AllGeoJSON } from "@turf/helpers";

	function pointOnFeature(geojson: AllGeoJSON): Feature<Point>;

	export default pointOnFeature;
}