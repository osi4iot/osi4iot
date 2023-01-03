export const defaultDashboard = `
{
	"annotations": {
		"list": [
			{
				"builtIn": 1,
				"datasource": "-- Grafana --",
				"enable": true,
				"hide": true,
				"iconColor": "rgba(0, 211, 255, 1)",
				"name": "Annotations & Alerts",
				"target": {
					"limit": 100,
					"matchAny": false,
					"tags": [],
					"type": "dashboard"
				},
				"type": "dashboard"
			}
		]
	},
	"description": "Default dashbord",
	"editable": true,
	"fiscalYearStartMonth": 0,
	"graphTooltip": 0,
	"id": 5,
	"links": [],
	"liveNow": false,
	"panels": [
		{
			"description": "Default panel",
			"fieldConfig": {
				"defaults": {
					"color": {
						"mode": "palette-classic"
					},
					"custom": {
						"axisLabel": "",
						"axisPlacement": "auto",
						"barAlignment": 0,
						"drawStyle": "line",
						"fillOpacity": 0,
						"gradientMode": "none",
						"hideFrom": {
							"legend": false,
							"tooltip": false,
							"viz": false
						},
						"lineInterpolation": "linear",
						"lineWidth": 1,
						"pointSize": 5,
						"scaleDistribution": {
							"type": "linear"
						},
						"showPoints": "auto",
						"spanNulls": true,
						"stacking": {
							"group": "A",
							"mode": "none"
						},
						"thresholdsStyle": {
							"mode": "off"
						}
					},
					"mappings": [],
					"thresholds": {
						"mode": "absolute",
						"steps": [
							{
								"color": "green",
								"value": null
							},
							{
								"color": "red",
								"value": 80
							}
						]
					}
				},
				"overrides": []
			},
			"gridPos": {
				"h": 21,
				"w": 24,
				"x": 0,
				"y": 0
			},
			"id": 2,
			"options": {
				"legend": {
					"calcs": [],
					"displayMode": "list",
					"placement": "bottom"
				},
				"tooltip": {
					"mode": "single",
					"sort": "none"
				}
			},
			"targets": [
				{
					"datasource": {
						"type": "postgres",
						"uid": ""
					},
					"format": "time_series",
					"group": [],
					"metricColumn": "none",
					"rawQuery": true,
					"rawSql": "",
					"refId": "A",
					"select": [
						[
							{
								"params": [
									"value"
								],
								"type": "column"
							}
						]
					],
					"timeColumn": "time",
					"where": [
						{
							"name": "$__timeFilter",
							"params": [],
							"type": "macro"
						}
					]
				}
			],
			"title": "Panel Title",
			"type": "timeseries"
		}
	],
	"refresh": "1s",
	"schemaVersion": 35,
	"style": "dark",
	"tags": [],
	"templating": {
		"list": []
	},
	"time": {
		"from": "now-25s",
		"to": "now"
	},
	"timepicker": {
		"refresh_intervals": [
			"200ms",
			"1s",
			"5s",
			"10s",
			"30s",
			"1m",
			"5m",
			"15m",
			"30m",
			"1h",
			"2h",
			"1d"
		]
	},
	"timezone": "",
	"title": "",
	"uid": "",
	"version": 2,
	"weekStart": ""
}
`;