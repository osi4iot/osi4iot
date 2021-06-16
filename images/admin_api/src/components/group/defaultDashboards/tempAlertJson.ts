export const tempAlertJson =
	`{
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
                    "datasourceId": 0,
                    "model": {
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
                    },
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
    }`