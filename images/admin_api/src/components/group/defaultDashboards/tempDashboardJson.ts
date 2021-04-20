export const tempDashboardJson =
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
		"editable": true,
		"gnetId": null,
		"graphTooltip": 0,
		"id": 3,
		"links": [],
		"panels": [
			{
				"alert": {
					"alertRuleTags": {},
					"conditions": [
						{
							"evaluator": {
								"params": [
									50
								],
								"type": "gt"
							},
							"operator": {
								"type": "and"
							},
							"query": {
								"params": [
									"A",
									"5m",
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
					"for": "3m",
					"frequency": "1m",
					"handler": 1,
					"message": "Device temperature has exceeded 50°C, please try to fix it as soon as possible.",
					"name": "Temperature evolution alert",
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
				"description": "Temperature panel for demostration",
				"fieldConfig": {
					"defaults": {
						"custom": {}
					},
					"overrides": []
				},
				"fill": 1,
				"fillGradient": 0,
				"gridPos": {
					"h": 21,
					"w": 18,
					"x": 0,
					"y": 0
				},
				"hiddenSeries": false,
				"id": 2,
				"legend": {
					"avg": false,
					"current": false,
					"max": true,
					"min": true,
					"show": true,
					"total": false,
					"values": true
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
				"thresholds": [
					{
						"colorMode": "critical",
						"fill": true,
						"line": true,
						"op": "gt",
						"value": 50,
						"visible": true
					}
				],
				"timeFrom": null,
				"timeRegions": [],
				"timeShift": null,
				"title": "Temperature evolution",
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
						"decimals": null,
						"format": "celsius",
						"label": "",
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
			},
			{
				"datasource": "",
				"description": "Temperature gauge for demostration",
				"fieldConfig": {
					"defaults": {
						"color": {
							"mode": "thresholds"
						},
						"custom": {},
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
									"value": 50
								}
							]
						},
						"unit": "celsius"
					},
					"overrides": []
				},
				"gridPos": {
					"h": 10,
					"w": 6,
					"x": 18,
					"y": 0
				},
				"id": 4,
				"options": {
					"reduceOptions": {
						"calcs": [
							"first"
						],
						"fields": "",
						"values": false
					},
					"showThresholdLabels": false,
					"showThresholdMarkers": true,
					"text": {}
				},
				"pluginVersion": "7.4.3",
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
				"timeFrom": null,
				"timeShift": null,
				"title": "Temperature gauge",
				"type": "gauge"
			},
			{
				"datasource": "",
				"description": "Temperature table for demostration",
				"fieldConfig": {
					"defaults": {
						"color": {
							"mode": "thresholds"
						},
						"custom": {
							"align": "center",
							"displayMode": "color-text",
							"filterable": true
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
									"value": 50
								}
							]
						},
						"unit": "celsius"
					},
					"overrides": [
						{
							"matcher": {
								"id": "byName",
								"options": "time"
							},
							"properties": [
								{
									"id": "custom.displayMode"
								}
							]
						}
					]
				},
				"gridPos": {
					"h": 11,
					"w": 6,
					"x": 18,
					"y": 10
				},
				"id": 6,
				"options": {
					"showHeader": true
				},
				"pluginVersion": "7.4.3",
				"targets": [
					{
						"format": "table",
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
				"timeFrom": null,
				"timeShift": null,
				"title": "Temperature table",
				"type": "table"
			}
		],
		"refresh": "1s",
		"schemaVersion": 27,
		"style": "dark",
		"tags": [],
		"templating": {
			"list": []
		},
		"time": {
			"from": "now-5m",
			"to": "now"
		},
		"timepicker": {
			"refresh_intervals": [
				"100ms",
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