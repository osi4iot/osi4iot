export const accelAlertJson =
	`{
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
        "message": "The acceleration of some axis of the mobile device has exceeded 40 m/s^2.",
        "name": "Acceleration evolution alert",
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