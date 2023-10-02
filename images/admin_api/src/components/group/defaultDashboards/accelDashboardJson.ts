export const accelDashboardJson =
	`{
		"annotations": {
			"list": [
				{
					"builtIn": 1,
					"datasource": "-- Grafana --",
					"enable": true,
					"hide": true,
					"iconColor": "rgba(0, 211, 255, 1)",
					"name": "Annotations & Alerts",
					"type": "dashboard"
				}
			]
		},
		"description": "Accelerations dashbord demo",
		"editable": true,
		"gnetId": null,
		"graphTooltip": 0,
		"id": 2,
		"links": [],
		"panels": [
			{
				"alert": {
					"alertRuleTags": {},
					"conditions": [
						{
						"evaluator": {
							"params": [
							40
							],
							"type": "gt"
						},
						"operator": {
							"type": "and"
						},
						"query": {
							"params": [
							"A",
							"20s",
							"now"
							]
						},
						"reducer": {
							"params": [],
							"type": "max"
						},
						"type": "query"
						}
					],
					"executionErrorState": "keep_state",
					"for": "0m",
					"frequency": "10s",
					"handler": 1,
					"message": "The acceleration of some axis of the mobile has exceeded 40 m/s^2.",
					"name": "Accelerations evolution alert",
					"noDataState": "ok",
					"notifications": [
						{
							"uid": ""
						},
						{
							"uid": ""
						}
					]
				},
				"aliasColors": {},
				"bars": false,
				"dashLength": 10,
				"dashes": false,
				"datasource": "",
				"description": "Accelerations for demostration",
				"fieldConfig": {
					"defaults": {
						"custom": {}
					},
					"overrides": []
				},
				"fill": 1,
				"fillGradient": 0,
				"gridPos": {
					"h": 20,
					"w": 24,
					"x": 0,
					"y": 0
				},
				"hiddenSeries": false,
				"id": 2,
				"legend": {
					"avg": false,
					"current": false,
					"max": false,
					"min": false,
					"show": true,
					"total": false,
					"values": false
				},
				"lines": true,
				"linewidth": 1,
				"nullPointMode": "null",
				"options": {
					"alertThreshold": true
				},
				"percentage": false,
				"pluginVersion": "7.4.3",
				"pointradius": 2,
				"points": false,
				"renderer": "flot",
				"seriesOverrides": [],
				"spaceLength": 10,
				"stack": false,
				"steppedLine": false,
				"targets": [
					{
						"format": "time_series",
						"group": [],
						"metricColumn": "none",
						"queryType": "randomWalk",
						"rawQuery": true,
						"rawSql": "",
						"refId": "A",
						"select": [
							[
								{
									"params": [
										"value_double"
									],
									"type": "column"
								}
							]
						],
						"table": "test_data",
						"timeColumn": "time_date_time",
						"timeColumnType": "timestamp",
						"where": [
							{
								"name": "$__timeFilter",
								"params": [],
								"type": "macro"
							}
						]
					}
				],
				"thresholds": [
					{
					  "colorMode": "critical",
					  "fill": true,
					  "line": true,
					  "op": "gt",
					  "value": 40,
					  "visible": true
					}
				],
				"timeFrom": null,
				"timeRegions": [],
				"timeShift": null,
				"title": "Accelerations",
				"tooltip": {
					"shared": true,
					"sort": 0,
					"value_type": "individual"
				},
				"type": "graph",
				"xaxis": {
					"buckets": null,
					"mode": "time",
					"name": null,
					"show": true,
					"values": []
				},
				"yaxes": [
					{
						"format": "accMS2",
						"label": null,
						"logBase": 1,
						"max": null,
						"min": null,
						"show": true
					},
					{
						"format": "short",
						"label": null,
						"logBase": 1,
						"max": null,
						"min": null,
						"show": true
					}
				],
				"yaxis": {
					"align": false,
					"alignLevel": null
				}
			}
		],
		"refresh": "200ms",
		"schemaVersion": 27,
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
		"version": 1
	}`;
