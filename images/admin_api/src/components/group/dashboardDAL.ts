import { v4 as uuidv4 } from "uuid";
import pool from "../../config/dbconfig";
import IGroup from "./interfaces/Group.interface";

export const insertDashboard = async (orgId: number, folderId: number, title: string, data: any): Promise<any> => {
	const now = new Date();
	const slug = title.replace(/ /g, "_").toLocaleLowerCase();
	const uuid = uuidv4();
	const response = await pool.query(`INSERT INTO grafanadb.dashboard (version, slug, title,
					data, org_id, created, updated,created_by, updated_by, gnet_id,
					plugin_id, folder_id, is_folder, has_acl, uid)
					VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
					RETURNING *`,
		[1, slug, title, data, orgId, now, now, -1, -1, 0, '', folderId, false, false, uuid]
	);
	return response.rows[0];
};

export const insertPreference = async (orgId: number, homeDashboardId: number): Promise<void> => {
	const now = new Date();
	const response = await pool.query(`INSERT INTO grafanadb.preferences (org_id, user_id, version,
					home_dashboard_id, timezone, theme, created, updated, team_id)
					VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
		[orgId, 0, 0, homeDashboardId, '', '', now, now,  0]
	);
};

export const createHomeDashboard = async (orgId: number,  orgAcronym: string, orgName: string, folderId: number): Promise<void> => {
	const home_dashboard_json = `{
		"annotations": {
		  "list": []
		},
		"editable": true,
		"gnetId": null,
		"graphTooltip": 0,
		"id": 16,
		"links": [],
		"panels": [
		  {
			"datasource": null,
			"fieldConfig": {
			  "defaults": {
				"custom": {}
			  },
			  "overrides": []
			},
			"gridPos": {
			  "h": 3,
			  "w": 24,
			  "x": 0,
			  "y": 0
			},
			"id": 2,
			"options": {
			  "content": "",
			  "mode": "html"
			},
			"pluginVersion": "7.3.4",
			"targets": [],
			"timeFrom": null,
			"timeShift": null,
			"title": "",
			"type": "text"
		  },
		  {
			"datasource": null,
			"fieldConfig": {
			  "defaults": {
				"custom": {}
			  },
			  "overrides": []
			},
			"folderId": null,
			"gridPos": {
			  "h": 34,
			  "w": 24,
			  "x": 0,
			  "y": 3
			},
			"headings": false,
			"id": 4,
			"limit": 20,
			"pluginVersion": "7.3.4",
			"query": "",
			"recent": false,
			"search": true,
			"starred": true,
			"tags": [],
			"targets": [],
			"timeFrom": null,
			"timeShift": null,
			"title": "Dashboard list",
			"type": "dashlist"
		  }
		],
		"schemaVersion": 26,
		"style": "dark",
		"tags": [],
		"templating": {
		  "list": []
		},
		"time": {
		  "from": "now-6h",
		  "to": "now"
		},
		"timepicker": {},
		"timezone": "",
		"title": "Home",
		"uid": "",
		"version": 1
	  }`;
	const home_dashboard = JSON.parse(home_dashboard_json);
	const title = `Home ${orgAcronym.replace(/_/g," ").toUpperCase()}`;
	const platformName = `${process.env.PLATFORM_NAME.replace(/_/g," ").toUpperCase()} PLATFORM`;
	const html_content = `<br/>\n<h1>${platformName}</h1>\n<h2>${orgName}</h2>\n`
	home_dashboard.panels[0].options.content = html_content;
	home_dashboard.uid = uuidv4();
	const response = await insertDashboard(orgId, folderId, title, home_dashboard);
	await insertPreference(orgId, response.id);
};

export const createDemoDashboards = async (orgAcronym: string, group: IGroup): Promise<void> => {
	const tempDashboardJson = `{
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
				  "uid": "Email_NC_demo"
				},
				{
				  "uid": "Telegram_NC_demo"
				}
			  ]
			},
			"aliasColors": {},
			"bars": false,
			"dashLength": 10,
			"dashes": false,
			"datasource": "iot_eebe_db",
			"description": "Test panel for iot demostration",
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
			"datasource": "iot_eebe_db",
			"description": "Temperature gauge for an iot demostration",
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
			"datasource": "iot_eebe_db",
			"description": "Temperature table for IOT demostration",
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

	const accelDashboardJson = `{
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
			"aliasColors": {},
			"bars": false,
			"dashLength": 10,
			"dashes": false,
			"datasource": "iot_eebe_db",
			"description": "Accelerations",
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
			"thresholds": [],
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
		"refresh": "100ms",
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

	const dataSourceName = `iot_${orgAcronym.replace(/ /g, "_").toLowerCase()}_db`;
	const grouAcronym = group.acronym;
	const tempDashboard = JSON.parse(tempDashboardJson);
	const titleTempDashboard = `${grouAcronym.replace(/ /g, "_")}_Temp_demo`;
	tempDashboard.uid = uuidv4();
	tempDashboard.title = titleTempDashboard;
	const tableHash = `Table_${group.groupUid}`;
	const rawSqlTemp = `SELECT timestamp AS \"time\", CAST(payload->>'temperature' AS DOUBLE PRECISION) AS \"Temperature\" FROM  iot_datasource.${tableHash} WHERE topic = 'temperature' AND $__timeFilter(timestamp) ORDER BY time DESC;`;
	for (let i = 0; i < 3; i++) {
		tempDashboard.panels[i].targets[0].rawSql = rawSqlTemp;
		tempDashboard.panels[i].datasource = dataSourceName;
	}
	tempDashboard.panels[0].alert.notifications[0].uid = `${group.acronym}_email_NC`
	tempDashboard.panels[0].alert.notifications[1].uid = `${group.acronym}_telegram_NC`
	await insertDashboard(group.orgId, group.folderId, titleTempDashboard, tempDashboard);


	const accelDashboard = JSON.parse(accelDashboardJson);
	const titleTempAccelDashboard = `${grouAcronym.replace(/ /g, "_")}_Accel_demo`;
	accelDashboard.uid = uuidv4();
	accelDashboard.title = titleTempAccelDashboard;
	accelDashboard.panels[0].datasource = dataSourceName;
	const rawSqlAccel = `SELECT timestamp AS \"time\", CAST(payload->>'ax' AS DOUBLE PRECISION) AS \"Ax\", CAST(payload->>'ay' AS DOUBLE PRECISION) AS \"Ay\", CAST(payload->>'az' AS DOUBLE PRECISION) AS \"Az\" FROM  iot_datasource.${tableHash} WHERE topic = 'accelerations' AND $__timeFilter(timestamp) ORDER BY time DESC;`;
	await insertDashboard(group.orgId, group.folderId, titleTempAccelDashboard , accelDashboard);
};