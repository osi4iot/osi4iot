import yaml from 'js-yaml';
import fs from 'fs';

export default function (osi4iotState) {
	const defaultVersion = osi4iotState.platformInfo.DOCKER_IMAGES_VERSION;

	const defaultServiceImageVersion = {
		system_prune: 'latest',
		traefik: 'v2.7' || 'latest',
		mosquitto_go_auth: '2.1.0-mosquitto_2.0.15' || 'latest',
		agent: '2.9.1-alpine' || 'latest',
		portainer: '2.9.1-alpine' || 'latest',
		pgadmin4: '2023-10-18-2' || 'latest',
		postgres: '14.6-alpine' || 'latest',
		timescaledb: '2.4.2-pg13' || 'latest',
		grafana: '8.4.1-ubuntu' || 'latest',
		grafana_renderer: '3.8.4' || 'latest',
		admin_api: defaultVersion || 'latest',
		frontend: defaultVersion || 'latest',
		nodered_instance: defaultVersion || 'latest',
		s3_storage: defaultVersion || 'latest',
		keepalived: 'latest',
		dev2pdb: defaultVersion || 'latest',
		minio: 'RELEASE.2023-10-16T04-13-43Z' || 'latest'
	}


	let existAtLeastOnex86_64ArchNode = false;
	let platformArch = 'x86_64';
	const nodesData = osi4iotState.platformInfo.NODES_DATA;
	const numSwarmNodes = nodesData.length;
	const numManagerNodes = nodesData.filter(node => node.nodeRole === "Manager").length;
	const existNFSServer = nodesData.filter(node => node.nodeRole === "NFS server").length !== 0;
	let storageSystem = "Local storage";
	const deploymentLocation = osi4iotState.platformInfo.DEPLOYMENT_LOCATION;
	const deploymentMode = osi4iotState.platformInfo.DEPLOYMENT_MODE;
	if (deploymentLocation === "On-premise cluster deployment" && existNFSServer) {
		storageSystem = "NFS Server";
	}
	if (deploymentLocation === "AWS cluster deployment") {
		storageSystem = "AWS EFS";
	}

	const domainCertsType = osi4iotState.platformInfo.DOMAIN_CERTS_TYPE;
	let entryPoint = "websecure";
	const traefik_command = [];
	const traefik_ports = [];
	let protocol = "https";
	if (domainCertsType === "No certs" || domainCertsType === "AWS Certificate Manager") {
		entryPoint = "web";
		traefik_command.push(
			'--api.insecure=false',
			'--entrypoints.web.address=:80',
			'--ping',
			'--providers.docker=true',
			'--providers.docker.swarmMode=true',
			'--providers.docker.exposedbydefault=false',
			'--providers.docker.network=traefik_public',
			'--api',
			'--accesslog',
			'--log'
		);
		traefik_ports.push('80:80');
		protocol = "http";
	} else {
		entryPoint = "websecure";
		traefik_command.push(
			'--api.insecure=false',
			'--entrypoints.web.address=:80',
			'--entrypoints.web.http.redirections.entrypoint.to=websecure',
			'--entrypoints.web.http.redirections.entrypoint.scheme=https',
			'--entrypoints.websecure.address=:443',
			'--ping',
			'--providers.file.directory=/etc/traefik/dynamic',
			'--providers.docker=true',
			'--providers.docker.swarmMode=true',
			'--providers.docker.exposedbydefault=false',
			'--providers.docker.network=traefik_public',
			'--api',
			'--accesslog',
			'--log'
		);
		traefik_ports.push('80:80', '443:443');
		protocol = "https";
	}

	let numReplicas = 3;
	if (numSwarmNodes === 1) {
		const nodeArch = nodesData[0].nodeArch;
		numReplicas = 1;
		if (nodeArch === "aarch64") platformArch = 'aarch64';
		else if (nodeArch === "x86_64") platformArch = 'x86_64';
		else {
			throw new Error('Only x64 or arm64 architectures are supported');
		}
	} else {
		for (let inode = 0; inode < nodesData.length; inode++) {
			const nodeRole = nodesData[inode].nodeRole;
			const nodeArch = nodesData[inode].nodeArch;
			if (!(nodeArch === "x86_64" || nodeArch === "aarch64")) {
				throw new Error('Only x64 or arm64 architectures are supported');
			}
			if (nodeRole === "Platform worker" && nodeArch === "x86_64") {
				existAtLeastOnex86_64ArchNode = true;
			}
		}
	}

	let nfsServerIP = null;
	if (existNFSServer) {
		nfsServerIP = osi4iotState.platformInfo.NODES_DATA.filter(node => node.nodeRole === "NFS server")[0].nodeIP || "127.0.0.1";
	}

	const domainName = osi4iotState.platformInfo.DOMAIN_NAME;
	const serviceImageVersion = defaultServiceImageVersion;

	let workerConstraintsArray = [
		`node.role==worker`,
		'node.labels.platform_worker==true'
	];

	if (numSwarmNodes === 1) {
		workerConstraintsArray = [
			`node.role==manager`
		]
	}

	const osi4iotStackObj = {
		version: "3.8",
		services: {
			system_prune: {
				image: `ghcr.io/osi4iot/system_prune:${serviceImageVersion['system_prune']}`,
				environment: [
					`TZ=${osi4iotState.platformInfo.DEFAULT_TIME_ZONE}`
				],
				volumes: [
					'/var/run/docker.sock:/var/run/docker.sock'
				],
				command: 'docker system prune --all --force',
				deploy: {
					mode: "global",
					restart_policy: {
						delay: "24h"
					}
				}
			},
			traefik: {
				image: `ghcr.io/osi4iot/traefik:${serviceImageVersion['traefik']}`,
				command: traefik_command,
				environment: [
					`TZ=${osi4iotState.platformInfo.DEFAULT_TIME_ZONE}`
				],
				deploy: {
					mode: 'replicated',
					replicas: numReplicas,
					update_config: {
						parallelism: 1,
						order: "start-first",
						failure_action: "rollback",
					},
					rollback_config: {
						parallelism: 0,
						order: "stop-first"
					},
					placement: {
						max_replicas_per_node: 2,
						constraints: ["node.role==manager"]
					}
				},
				ports: traefik_ports,
				networks: [
					'traefik_public'
				],
				volumes: [
					'/var/run/docker.sock:/var/run/docker.sock:ro'
				]
			},
			mosquitto: {
				image: `ghcr.io/osi4iot/mosquitto_go_auth:${serviceImageVersion['mosquitto_go_auth']}`,
				user: '${UID}:${GID}',
				environment: [
					`TZ=${osi4iotState.platformInfo.DEFAULT_TIME_ZONE}`
				],
				networks: [
					'internal_net'
				],
				ports: [
					"1883:1883",
					"8883:8883",
					"9001:9001"
				],
				volumes: [
					'mosquitto_data:/mosquitto/data',
					'mosquitto_log:/mosquitto/log'
				],
				secrets: [
					{
						source: 'mqtt_certs_ca_cert',
						target: '/mosquitto/mqtt_certs/ca.crt',
						mode: 0o444
					},
					{
						source: 'mqtt_broker_cert',
						target: '/mosquitto/mqtt_certs/server.crt',
						mode: 0o444
					},
					{
						source: 'mqtt_broker_key',
						target: '/mosquitto/mqtt_certs/server.key',
						mode: 0o444
					}
				],
				configs: [
					{
						source: 'mosquitto_conf',
						target: '/etc/mosquitto/mosquitto.conf',
						mode: 0o440
					},
					{
						source: 'mosquitto_go_auth_conf',
						target: '/etc/mosquitto/conf.d/go-auth.conf',
						mode: 0o777
					}
				],
				deploy: {
					replicas: 1,
					placement: {
						constraints: workerConstraintsArray
					}
				},
			},
			agent: {
				image: `ghcr.io/osi4iot/portainer_agent:${serviceImageVersion['agent']}`,
				environment: [
					"AGENT_CLUSTER_ADDR=tasks.agent",
					`TZ=${osi4iotState.platformInfo.DEFAULT_TIME_ZONE}`
				],
				volumes: [
					'/var/run/docker.sock:/var/run/docker.sock',
					'/var/lib/docker/volumes:/var/lib/docker/volumes'
				],
				networks: [
					'agent_network'
				],
				deploy: {
					mode: 'global',
					placement: {
						constraints: ["node.platform.os==linux"]
					}
				}
			},
			portainer: {
				image: `ghcr.io/osi4iot/portainer:${serviceImageVersion['portainer']}`,
				command: '-H tcp://tasks.agent:9001 --tlsskipverify',
				environment: [
					`TZ=${osi4iotState.platformInfo.DEFAULT_TIME_ZONE}`
				],
				volumes: [
					'portainer_data:/data'
				],
				networks: [
					'traefik_public',
					'agent_network'
				],
				deploy: {
					mode: 'replicated',
					replicas: 1,
					placement: {
						constraints: ["node.role==manager"]
					},
					labels: [
						'traefik.enable=true',
						`traefik.http.routers.portainer.rule=Host(\`${domainName}\`) && PathPrefix(\`/portainer/\`)`,
						'traefik.http.middlewares.portainerpathstrip.stripprefix.prefixes=/portainer',
						'traefik.http.routers.portainer.middlewares=portainerpathstrip@docker',
						`traefik.http.routers.portainer.entrypoints=${entryPoint}`,
						'traefik.http.routers.portainer.tls=true',
						'traefik.http.routers.portainer.service=portainer',
						'traefik.http.services.portainer.loadbalancer.server.port=9000'
					]
				}
			},
			postgres: {
				image: `ghcr.io/osi4iot/postgres:${serviceImageVersion['postgres']}`,
				networks: [
					'internal_net'
				],
				secrets: [
					{
						source: 'postgres_user',
						target: 'postgres_user.txt',
						mode: 0o400
					},
					{
						source: 'postgres_password',
						target: 'postgres_password.txt',
						mode: 0o400
					},
					{
						source: 'postgres_grafana',
						target: 'postgres_grafana.txt',
						mode: 0o400
					}

				],
				volumes: [
					'pgdata:/var/lib/postgresql/data'
				],
				environment: [
					`POSTGRES_DB=${osi4iotState.platformInfo.POSTGRES_DB}`,
					'POSTGRES_PASSWORD_FILE=/run/secrets/postgres_password.txt',
					'POSTGRES_USER_FILE=/run/secrets/postgres_user.txt',
					`TZ=${osi4iotState.platformInfo.DEFAULT_TIME_ZONE}`
				],
				deploy: {
					mode: 'replicated',
					replicas: 1,
					placement: {
						constraints: workerConstraintsArray
					}
				}
			},			
			timescaledb: {
				image: `ghcr.io/osi4iot/timescaledb:${serviceImageVersion['timescaledb']}`,
				networks: [
					'internal_net'
				],
				secrets: [
					{
						source: 'timescaledb_user',
						target: 'timescaledb_user.txt',
						mode: 0o400
					},
					{
						source: 'timescaledb_password',
						target: 'timescaledb_password.txt',
						mode: 0o400
					},
					{
						source: 'timescaledb_grafana',
						target: 'timescaledb_grafana.txt',
						mode: 0o400
					},
					{
						source: 'timescaledb_data_ret_int',
						target: 'timescaledb_data_ret_int.txt',
						mode: 0o400
					}
				],
				volumes: [
					'timescaledb_data:/var/lib/postgresql/data'
				],
				environment: [
					`POSTGRES_DB=${osi4iotState.platformInfo.TIMESCALE_DB}`,
					'POSTGRES_PASSWORD_FILE=/run/secrets/timescaledb_password.txt',
					'POSTGRES_USER_FILE=/run/secrets/timescaledb_user.txt',
					`TZ=${osi4iotState.platformInfo.DEFAULT_TIME_ZONE}`
				],
				deploy: {
					mode: 'replicated',
					replicas: 1,
					placement: {
						constraints: workerConstraintsArray
					}
				}
			},
			s3_storage: {
				image: `ghcr.io/osi4iot/s3_storage:${serviceImageVersion['s3_storage']}`,
				networks: [
					'internal_net',
				],
				environment: [
					`TZ=${osi4iotState.platformInfo.DEFAULT_TIME_ZONE}`
				],				
				volumes: [
					's3_storage_data:/data'
				],
				working_dir: '/app',
				secrets: [
					{
						source: 's3_storage',
						target: 's3_storage.txt',
						mode: 0o444
					}
				],
				configs: [
					{
						source: 's3_storage_conf',
						target: '/run/configs/s3_storage.conf',
						mode: 0o444
					}

				],
				ports: [
					'3500:3500'
				],
				deploy: {
					placement: {
						constraints: workerConstraintsArray
					}
				}
			},			
			dev2pdb: {
				image: `ghcr.io/osi4iot/dev2pdb:${serviceImageVersion['dev2pdb']}`,
				networks: [
					'internal_net',
				],
				environment: [
					'DATABASE_NAME=iot_data_db',
					`TZ=${osi4iotState.platformInfo.DEFAULT_TIME_ZONE}`
				],
				secrets: [
					{
						source: 'dev2pdb_password',
						target: 'dev2pdb_password.txt',
						mode: 0o400
					},
					{
						source: 'timescaledb_user',
						target: 'timescaledb_user.txt',
						mode: 0o400
					},
					{
						source: 'timescaledb_password',
						target: 'timescaledb_password.txt',
						mode: 0o400
					}
				],
				deploy: {
					placement: {
						constraints: workerConstraintsArray
					}
				}
			},
			grafana: {
				image: `ghcr.io/osi4iot/grafana:${serviceImageVersion['grafana']}`,
				user: '${UID}:${GID}',
				environment: [
					`TZ=${osi4iotState.platformInfo.DEFAULT_TIME_ZONE}`
				],
				networks: [
					'internal_net',
					'traefik_public'
				],
				volumes: [
					'grafana_data:/var/lib/grafana'
				],
				secrets: [
					{
						source: 'grafana',
						target: 'grafana.txt',
						mode: 0o400
					}
				],
				configs: [
					{
						source: 'grafana_conf',
						target: '/run/configs/grafana.conf',
						mode: 0o444
					}
				],
				deploy: {
					mode: 'replicated',
					replicas: numReplicas,
					update_config: {
						parallelism: 1,
						order: "start-first",
						failure_action: "rollback",
					},
					rollback_config: {
						parallelism: 0,
						order: "stop-first"
					},
					placement: {
						max_replicas_per_node: 2,
						constraints: ["node.role==manager"]
					},
					labels: [
						'traefik.enable=true',
						`traefik.http.routers.grafana.rule=Host(\`${domainName}\`) && PathPrefix(\`/grafana/\`)`,
						'traefik.http.middlewares.grafana-prefix.stripprefix.prefixes=/grafana',
						'traefik.http.routers.grafana.middlewares=grafana-prefix,grafana-header,grafana-redirectregex',
						'traefik.http.middlewares.grafana-prefix.stripprefix.forceslash=false',
						'traefik.http.middlewares.grafana-header.headers.customrequestheaders.X-Script-Name=/grafana/',
						`traefik.http.middlewares.grafana-redirectregex.redirectregex.regex=${domainName}/(grafana*)`,
						`traefik.http.middlewares.grafana-redirectregex.redirectregex.replacement=${domainName}/\$\${1}"`,
						"traefik.http.routers.grafana.entrypoints=websecure",
						'traefik.http.routers.grafana.tls=true',
						'traefik.http.routers.grafana.service=grafana',
						'traefik.http.services.grafana.loadbalancer.server.port=5000',
						'traefik.http.services.grafana.loadbalancer.healthCheck.path=/api/health',
						'traefik.http.services.grafana.loadbalancer.healthCheck.interval=5s',
						'traefik.http.services.grafana.loadbalancer.healthCheck.timeout=3s'
					]
				}
			},
			admin_api: {
				image: `ghcr.io/osi4iot/admin_api:${serviceImageVersion['admin_api']}`,
				environment: [
					'REPLICA={{.Task.Slot}}',
					`TZ=${osi4iotState.platformInfo.DEFAULT_TIME_ZONE}`
				],
				networks: [
					'internal_net',
					'traefik_public'
				],
				volumes: [
					'admin_api_log:/app/logs'
				],
				working_dir: '/app',
				secrets: [
					{
						source: 'mqtt_certs_ca_cert',
						target: 'ca.crt',
						mode: 0o444
					},
					{
						source: 'mqtt_certs_ca_key',
						target: 'ca.key',
						mode: 0o444
					},
					{
						source: 'admin_api',
						target: 'admin_api.txt',
						mode: 0o444
					}
				],
				configs: [
					{
						source: 'admin_api_conf',
						target: '/run/configs/admin_api.conf',
						mode: 0o444
					},
					{
						source: 'admin_api_main_org_building',
						target: '/run/configs/main_org_building.geojson',
						mode: 0o444
					},
					{
						source: 'admin_api_main_org_floor',
						target: '/run/configs/main_org_floor.geojson',
						mode: 0o444
					}					
				],
				ports: [
					'3200:3200'
				],
				deploy: {
					mode: 'replicated',
					replicas: numReplicas,
					update_config: {
						parallelism: 1,
						order: "start-first",
						failure_action: "rollback",
					},
					rollback_config: {
						parallelism: 0,
						order: "stop-first"
					},
					placement: {
						max_replicas_per_node: 2,
						constraints: workerConstraintsArray
					},
					labels: [
						'traefik.enable=true',
						`traefik.http.routers.admin_api.rule=Host(\`${domainName}\`) && PathPrefix(\`/admin_api/\`)`,
						'traefik.http.middlewares.admin_api-prefix.stripprefix.prefixes=/admin_api',
						'traefik.http.routers.admin_api.middlewares=admin_api-prefix,admin_api-header,admin_api-redirectregex',
						'traefik.http.routers.admin_api.middlewares=admin_api-prefix',
						'traefik.http.middlewares.admin_api-prefix.stripprefix.forceslash=false',
						'traefik.http.middlewares.admin_api-header.headers.customrequestheaders.X-Script-Name=/admin_api/',
						`traefik.http.middlewares.admin_api-redirectregex.redirectregex.regex=${domainName}/(admin_api*)`,
						`traefik.http.middlewares.admin_api-redirectregex.redirectregex.replacement=${domainName}/\$\${1}"`,
						"traefik.http.routers.admin_api.entrypoints=websecure",
						'traefik.http.routers.admin_api.tls=true',
						'traefik.http.routers.admin_api.service=admin_api',
						'traefik.http.services.admin_api.loadbalancer.server.port=3200',
						'traefik.http.services.admin_api.loadbalancer.healthCheck.path=/health',
						'traefik.http.services.admin_api.loadbalancer.healthCheck.interval=5s',
						'traefik.http.services.admin_api.loadbalancer.healthCheck.timeout=3s'
					]
				}
			},
			frontend: {
				image: `ghcr.io/osi4iot/frontend:${serviceImageVersion['frontend']}`,
				environment: [
					`TZ=${osi4iotState.platformInfo.DEFAULT_TIME_ZONE}`
				],
				configs: [
					{
						source: 'frontend_conf',
						target: '/run/configs/frontend.conf',
						mode: 0o444
					}
				],
				networks: [
					'traefik_public'
				],
				command: 'nginx -g "daemon off";',
				deploy: {
					mode: 'replicated',
					replicas: numReplicas,
					update_config: {
						parallelism: 1,
						order: "start-first",
						failure_action: "rollback",
					},
					rollback_config: {
						parallelism: 0,
						order: "stop-first"
					},
					placement: {
						max_replicas_per_node: 2,
						constraints: workerConstraintsArray
					},
					labels: [
						'traefik.enable=true',
						`traefik.http.routers.frontend.rule=Host(\`${domainName}\`)`,
						`traefik.http.routers.frontend.entrypoints=${entryPoint}`,
						'traefik.http.routers.frontend.tls=true',
						'traefik.http.routers.frontend.service=frontend',
						'traefik.http.services.frontend.loadbalancer.server.port=80',
						'traefik.http.services.frontend.loadbalancer.healthCheck.path=/health',
						'traefik.http.services.frontend.loadbalancer.healthCheck.interval=5s',
						'traefik.http.services.frontend.loadbalancer.healthCheck.timeout=3s'
					]
				}
			}
		},
		networks: {
			agent_network: {
				external: true
			},
			traefik_public: {
				external: true
			},
			internal_net: {
				external: true
			}
		},
		volumes: {
			mosquitto_data: {
				driver: 'local'
			},
			mosquitto_log: {
				driver: 'local'
			},
			pgdata: {
				driver: 'local'
			},
			timescaledb_data: {
				driver: 'local'
			},
			portainer_data: {
				driver: 'local'
			},
			grafana_data: {
				driver: 'local'
			},
			admin_api_log: {
				driver: 'local'
			},
			s3_storage_data: {
				driver: 'local'
			}
		},
		secrets: {
			mqtt_certs_ca_cert: {
				file: './certs/mqtt_certs/ca_certs/ca.crt',
				name: osi4iotState.certs.mqtt_certs.ca_certs.mqtt_certs_ca_cert_name
			},
			mqtt_certs_ca_key: {
				file: './certs/mqtt_certs/ca_certs/ca.key',
				name: osi4iotState.certs.mqtt_certs.ca_certs.mqtt_certs_ca_key_name
			},
			mqtt_broker_cert: {
				file: './certs/mqtt_certs/broker/server.crt',
				name: osi4iotState.certs.mqtt_certs.broker.mqtt_broker_cert_name
			},
			mqtt_broker_key: {
				file: './certs/mqtt_certs/broker/server.key',
				name: osi4iotState.certs.mqtt_certs.broker.mqtt_broker_key_name
			},
			postgres_user: {
				file: './secrets/postgres_user.txt'
			},
			postgres_password: {
				file: './secrets/postgres_password.txt'
			},
			postgres_grafana: {
				file: './secrets/postgres_grafana.txt'
			},			
			timescaledb_user: {
				file: './secrets/timescaledb_user.txt'
			},
			timescaledb_password: {
				file: './secrets/timescaledb_password.txt'
			},
			timescaledb_grafana: {
				file: './secrets/timescaledb_grafana.txt'
			},
			timescaledb_data_ret_int: {
				file: './secrets/timescaledb_data_ret_int.txt'
			},
			dev2pdb_password: {
				file: './secrets/dev2pdb_password.txt'
			},
			grafana: {
				file: './secrets/grafana.txt'
			},
			admin_api: {
				file: './secrets/admin_api.txt',
				name: osi4iotState.admin_api_secret_name
			},
			s3_storage: {
				file: './secrets/s3_storage.txt',
			}
		},
		configs: {
			mosquitto_conf: {
				file: './config/mosquitto/mosquitto.conf'
			},
			mosquitto_go_auth_conf: {
				file: './config/mosquitto/go-auth.conf'
			},
			grafana_conf: {
				file: './config/grafana/grafana.conf'
			},
			admin_api_conf: {
				file: './config/admin_api/admin_api.conf'
			},
			admin_api_main_org_building: {
				file: './config/admin_api/main_org_building.geojson'
			},
			admin_api_main_org_floor: {
				file: './config/admin_api/main_org_floor.geojson'
			},				
			frontend_conf: {
				file: './config/frontend/frontend.conf',
			},
			s3_storage_conf: {
				file: './config/s3_storage/s3_storage.conf',
			}
		}
	}

	if (deploymentMode === "development") {
		osi4iotStackObj.services['pgadmin4'] =  {
			image: `ghcr.io/osi4iot/pgadmin4:${serviceImageVersion['pgadmin4']}`,
			user: '${UID}:${GID}',
			environment: [
				`TZ=${osi4iotState.platformInfo.DEFAULT_TIME_ZONE}`
			],
			secrets: [
				{
					source: 'pgadmin4',
					target: 'pgadmin4.txt',
					mode: 0o400
				}
			],
			volumes: [
				'pgadmin4_data:/var/lib/pgadmin'
			],
			networks: [
				'internal_net',
				'traefik_public'
			],
			deploy: {
				placement: {
					constraints: workerConstraintsArray
				},
				labels: [
					'traefik.enable=true',
					`traefik.http.routers.pgadmin4.rule=Host(\`${domainName}\`) && PathPrefix(\`/pgadmin4/\`)`,
					'traefik.http.middlewares.pgadmin4-prefix.stripprefix.prefixes=/pgadmin4',
					'traefik.http.routers.pgadmin4.middlewares=pgadmin4-prefix,pgadmin4-header,pgadmin4-redirectregex',
					'traefik.http.middlewares.pgadmin4-prefix.stripprefix.forceslash=false',
					'traefik.http.middlewares.pgadmin4-header.headers.customrequestheaders.X-Script-Name=/pgadmin4/',
					`traefik.http.middlewares.pgadmin4-redirectregex.redirectregex.regex=${domainName}/(pgadmin4*)`,
					`traefik.http.middlewares.pgadmin4-redirectregex.redirectregex.replacement=${domainName}/\$\${1}"`,
					"traefik.http.routers.pgadmin4.entrypoints=websecure",
					'traefik.http.routers.pgadmin4.tls=true',
					'traefik.http.routers.pgadmin4.service=pgadmin4',
					'traefik.http.services.pgadmin4.loadbalancer.server.port=80'
				]
			}
		}

		osi4iotStackObj.volumes.pgadmin4_data = {
			driver: 'local',
		}

		osi4iotStackObj.secrets.pgadmin4 = {
			file: './secrets/pgadmin4.txt'
		}
	}

	if (deploymentLocation !== "AWS cluster deployment") {
		let minioConstraintsArray = [
			`node.role==worker`,
			'node.labels.nfs_server==true'
		];

		if (numSwarmNodes === 1) {
			minioConstraintsArray = [
				`node.role==manager`
			]
		}
		osi4iotStackObj.services['minio'] = {
			image: `ghcr.io/osi4iot/minio:${serviceImageVersion['minio']}`,
			hostname: 'minio',
			user: "${UID}:${GID}",
			secrets: [
				{
					source: 'minio',
					target: '/run/secrets/minio.txt',
					mode: 0o444
				}
			],
			networks: [
				'internal_net',
				'traefik_public'
			],
			environment: [
				"MINIO_VOLUMES=/mnt/data",
				`MINIO_BROWSER_REDIRECT_URL=${protocol}://${domainName}/minio`,
				`TZ=${osi4iotState.platformInfo.DEFAULT_TIME_ZONE}`
			],
			command: 'server --console-address ":9090" /mnt/data',
			volumes: [
				'minio_storage:/mnt/data'
			],
			deploy: {
				mode: 'replicated',
				replicas: 1,
				placement: {
					constraints: minioConstraintsArray
				},
				labels: [
					// MINIO API
					'traefik.enable=true',
					`traefik.http.routers.minio_api.rule=Host(\`minio.${domainName}\`)`,
					"traefik.http.routers.minio_api.entrypoints=websecure",
					'traefik.http.routers.minio_api.tls=true',
					"traefik.http.routers.minio_api.service=minio",
					"traefik.http.services.minio_api.loadbalancer.server.port=9000",
					'traefik.http.services.minio_api.loadbalancer.healthCheck.path=/minio/health/live',
					'traefik.http.services.minio_api.loadbalancer.healthCheck.interval=5s',
					'traefik.http.services.minio_api.loadbalancer.healthCheck.timeout=3s',

					// MINIO CONSOLE
					`traefik.http.routers.minio_console.rule=Host(\`${domainName}\`) && PathPrefix(\`/minio\`)`,
					'traefik.http.middlewares.minio_console-prefix.stripprefix.prefixes=/minio',
					'traefik.http.routers.minio_console.middlewares=minio_console-prefix,minio_console-header,minio_console-redirectregex',
					'traefik.http.routers.minio_console.middlewares=minio_console-prefix',
					'traefik.http.middlewares.minio_console-prefix.stripprefix.forceslash=false',
					'traefik.http.middlewares.minio_console-header.headers.customrequestheaders.X-Script-Name=/minio/',
					`traefik.http.middlewares.minio_console-redirectregex.redirectregex.regex=${domainName}/(minio*)`,
					`traefik.http.middlewares.minio_console-redirectregex.redirectregex.replacement=${domainName}/\$\${1}"`,
					"traefik.http.routers.minio_console.entrypoints=websecure",
					'traefik.http.routers.minio_console.tls=true',
					'traefik.http.routers.minio_console.service=minio_console',
					'traefik.http.services.minio_console.loadbalancer.server.port=9090',
				]
			}
		}

		osi4iotStackObj.volumes.minio_storage = {
			driver: 'local',
		}

		osi4iotStackObj.secrets.minio = {
			file: './secrets/minio.txt'
		}
	}

	if (domainCertsType === "No certs" || domainCertsType === "AWS Certificate Manager") {
		osi4iotStackObj.services['portainer'].deploy.labels = osi4iotStackObj.services['portainer'].deploy.labels.filter(elm => elm !== 'traefik.http.routers.portainer.tls=true');

		if (deploymentMode === "development") {
			osi4iotStackObj.services['pgadmin4'].deploy.labels = [
				'traefik.enable=true',
				`traefik.http.routers.pgadmin4.rule=Host(\`${domainName}\`) && PathPrefix(\`/pgadmin4/\`)`,
				'traefik.http.middlewares.pgadmin4-prefix.stripprefix.prefixes=/pgadmin4',
				'traefik.http.routers.pgadmin4.middlewares=pgadmin4-prefix,pgadmin4-header',
				'traefik.http.middlewares.pgadmin4-prefix.stripprefix.forceslash=false',
				'traefik.http.middlewares.pgadmin4-header.headers.customrequestheaders.X-Script-Name=/pgadmin4/',
				"traefik.http.routers.pgadmin4.entrypoints=web",
				'traefik.http.routers.pgadmin4.service=pgadmin4',
				'traefik.http.services.pgadmin4.loadbalancer.server.port=80'
			];
		}

		osi4iotStackObj.services['grafana'].deploy.labels = [
			'traefik.enable=true',
			`traefik.http.routers.grafana.rule=Host(\`${domainName}\`) && PathPrefix(\`/grafana/\`)`,
			'traefik.http.middlewares.grafana-prefix.stripprefix.prefixes=/grafana',
			'traefik.http.routers.grafana.middlewares=grafana-prefix,grafana-header',
			'traefik.http.middlewares.grafana-prefix.stripprefix.forceslash=false',
			'traefik.http.middlewares.grafana-header.headers.customrequestheaders.X-Script-Name=/grafana/',
			"traefik.http.routers.grafana.entrypoints=web",
			'traefik.http.routers.grafana.service=grafana',
			'traefik.http.services.grafana.loadbalancer.server.port=5000',
			'traefik.http.services.grafana.loadbalancer.healthCheck.path=/api/health',
			'traefik.http.services.grafana.loadbalancer.healthCheck.interval=5s',
			'traefik.http.services.grafana.loadbalancer.healthCheck.timeout=3s'
		]

		osi4iotStackObj.services['admin_api'].deploy.labels = [
			'traefik.enable=true',
			`traefik.http.routers.admin_api.rule=Host(\`${domainName}\`) && PathPrefix(\`/admin_api/\`)`,
			'traefik.http.middlewares.admin_api-prefix.stripprefix.prefixes=/admin_api',
			'traefik.http.routers.admin_api.middlewares=admin_api-prefix,admin_api-header',
			'traefik.http.routers.admin_api.middlewares=admin_api-prefix',
			'traefik.http.middlewares.admin_api-prefix.stripprefix.forceslash=false',
			'traefik.http.middlewares.admin_api-header.headers.customrequestheaders.X-Script-Name=/admin_api/',
			"traefik.http.routers.admin_api.entrypoints=web",
			'traefik.http.routers.admin_api.service=admin_api',
			'traefik.http.services.admin_api.loadbalancer.server.port=3200',
			'traefik.http.services.admin_api.loadbalancer.healthCheck.path=/health',
			'traefik.http.services.admin_api.loadbalancer.healthCheck.interval=5s',
			'traefik.http.services.admin_api.loadbalancer.healthCheck.timeout=3s'
		];

		osi4iotStackObj.services['frontend'].deploy.labels = osi4iotStackObj.services['frontend'].deploy.labels.filter(elm => elm !== 'traefik.http.routers.frontend.tls=true');

		if (deploymentLocation !== "AWS cluster deployment") {
			osi4iotStackObj.services['minio'].deploy.labels = [
				// MINIO API
				'traefik.enable=true',
				`traefik.http.routers.minio_api.rule=Host(\`${domainName}\`) && PathPrefix(\`/minio_api\`)`,
				'traefik.http.middlewares.minio_api-prefix.stripprefix.prefixes=/minio_api',
				'traefik.http.routers.minio_api.middlewares=minio_api-prefix,minio_api-header,minio_api-redirectregex',
				'traefik.http.middlewares.minio_api-prefix.stripprefix.forceslash=false',
				'traefik.http.middlewares.minio_api-header.headers.customrequestheaders.X-Script-Name=/minio_api/',
				"traefik.http.middlewares.minio_api-header.headers.customrequestheaders.Host=minio:9000",
				`traefik.http.middlewares.minio_api-redirectregex.redirectregex.regex=${domainName}/(minio_api*)`,
				`traefik.http.middlewares.minio_api-redirectregex.redirectregex.replacement=${domainName}/\$\${1}"`,
				"traefik.http.routers.minio_api.entrypoints=web",
				'traefik.http.routers.minio_api.service=minio_api',
				'traefik.http.services.minio_api.loadbalancer.server.port=9000',
				'traefik.http.services.minio_api.loadbalancer.healthCheck.path=/minio/health/live',
				'traefik.http.services.minio_api.loadbalancer.healthCheck.interval=5s',
				'traefik.http.services.minio_api.loadbalancer.healthCheck.timeout=3s',
				'traefik.http.services.minio_api.loadbalancer.passhostheader=false',
				// MINIO CONSOLE
				`traefik.http.routers.minio_console.rule=Host(\`${domainName}\`) && PathPrefix(\`/minio\`)`,
				'traefik.http.middlewares.minio_console-prefix.stripprefix.prefixes=/minio',
				'traefik.http.routers.minio_console.middlewares=minio_console-prefix,minio_console-header,minio_console-redirectregex',
				'traefik.http.middlewares.minio_console-prefix.stripprefix.forceslash=false',
				'traefik.http.middlewares.minio_console-header.headers.customrequestheaders.X-Script-Name=/minio/',
				`traefik.http.middlewares.minio_console-redirectregex.redirectregex.regex=${domainName}/(minio*)`,
				`traefik.http.middlewares.minio_console-redirectregex.redirectregex.replacement=${domainName}/\$\${1}"`,
				"traefik.http.routers.minio_console.entrypoints=web",
				'traefik.http.routers.minio_console.service=minio_console',
				'traefik.http.services.minio_console.loadbalancer.server.port=9090'
			];
		}

	} else {
		osi4iotStackObj.secrets.iot_platform_ca = {
			file: './certs/domain_certs/iot_platform_ca.pem',
			name: osi4iotState.certs.domain_certs.iot_platform_ca_name
		};
		osi4iotStackObj.secrets.iot_platform_cert = {
			file: './certs/domain_certs/iot_platform_cert.cer',
			name: osi4iotState.certs.domain_certs.iot_platform_cert_name
		};
		osi4iotStackObj.secrets.iot_platform_key = {
			file: './certs/domain_certs/iot_platform.key',
			name: osi4iotState.certs.domain_certs.iot_platform_key_name
		};

		osi4iotStackObj.services['traefik'].secrets = [
			{
				source: 'iot_platform_cert',
				target: 'iot_platform_cert.cer',
				mode: 0o400
			},
			{
				source: 'iot_platform_key',
				target: 'iot_platform.key',
				mode: 0o400
			}
		];

		osi4iotStackObj.services['mosquitto'].secrets.push(
			{
				source: 'iot_platform_ca',
				target: '/mosquitto/wss_certs/iot_platform_ca.pem',
				mode: 0o444
			},
			{
				source: 'iot_platform_cert',
				target: '/mosquitto/wss_certs/iot_platform_cert.cer',
				mode: 0o444
			},
			{
				source: 'iot_platform_key',
				target: '/mosquitto/wss_certs/iot_platform.key',
				mode: 0o444
			}
		)
	}

	if (platformArch === 'x86_64') {
		osi4iotStackObj.services["grafana_renderer"] = {
			image: `ghcr.io/osi4iot/grafana_renderer:${serviceImageVersion['grafana_renderer']}`,
			networks: [
				'internal_net'
			],
			ports: [
				'8081'
			],
			environment: [
				`TZ=${osi4iotState.platformInfo.DEFAULT_TIME_ZONE}`,
				'ENABLE_METRICS=true'
			],
			deploy: {
				placement: {
					constraints: [...workerConstraintsArray, 'node.platform.arch==x86_64']
				}
			}
		}
	}

	if (numSwarmNodes > 1) {
		if (numManagerNodes > 1 && platformArch === 'x86_64' && deploymentLocation === "On-premise cluster deployment") {
			osi4iotStackObj.services["keepalived"] = {
				image: `ghcr.io/osi4iot/keepalived:${serviceImageVersion['keepalived']}`,
				volumes: [
					'/var/run/docker.sock:/var/run/docker.sock',
					'/usr/bin/docker:/usr/bin/docker:ro'
				],
				networks: [
					'internal_net'
				],
				environment: [
					`TZ=${osi4iotState.platformInfo.DEFAULT_TIME_ZONE}`,
					`KEEPALIVED_VIRTUAL_IPS=${osi4iotState.platformInfo.FLOATING_IP_ADDRES}`,
					`KEEPALIVED_INTERFACE=${osi4iotState.platformInfo.NETWORK_INTERFACE}`
				],
				deploy: {
					mode: 'global',
					placement: {
						constraints: ["node.role==manager"]
					}
				}
			}
		}

		if (storageSystem === "NFS Server") {
			osi4iotStackObj.volumes['mosquitto_data'] = {
				driver: 'local',
				driver_opts: {
					type: 'nfs',
					o: `nfsvers=4,addr=${nfsServerIP},rw`,
					device: ':/var/nfs_osi4iot/mosquitto_data'
				}
			}

			osi4iotStackObj.volumes['mosquitto_log'] = {
				driver: 'local',
				driver_opts: {
					type: 'nfs',
					o: `nfsvers=4,addr=${nfsServerIP},rw`,
					device: ':/var/nfs_osi4iot/mosquitto_log'
				}
			}

			osi4iotStackObj.volumes['pgdata'] = {
				driver: 'local',
				driver_opts: {
					type: 'nfs',
					o: `nfsvers=4,addr=${nfsServerIP},rw`,
					device: ':/var/nfs_osi4iot/pgdata'
				}
			}

			osi4iotStackObj.volumes['timescaledb_data'] = {
				driver: 'local',
				driver_opts: {
					type: 'nfs',
					o: `nfsvers=4,addr=${nfsServerIP},rw`,
					device: ':/var/nfs_osi4iot/timescaledb_data'
				}
			}

			osi4iotStackObj.volumes['portainer_data'] = {
				driver: 'local',
				driver_opts: {
					type: 'nfs',
					o: `nfsvers=4,addr=${nfsServerIP},rw`,
					device: ':/var/nfs_osi4iot/portainer_data'
				}
			}

			osi4iotStackObj.volumes['grafana_data'] = {
				driver: 'local',
				driver_opts: {
					type: 'nfs',
					o: `nfsvers=4,addr=${nfsServerIP},rw`,
					device: ':/var/nfs_osi4iot/grafana_data'
				}
			}

			osi4iotStackObj.volumes['admin_api_log'] = {
				driver: 'local',
				driver_opts: {
					type: 'nfs',
					o: `nfsvers=4,addr=${nfsServerIP},rw`,
					device: ':/var/nfs_osi4iot/admin_api_log'
				}
			}

			osi4iotStackObj.volumes['s3_storage_data'] = {
				driver: 'local',
				driver_opts: {
					type: 'nfs',
					o: `nfsvers=4,addr=${nfsServerIP},rw`,
					device: ':/var/nfs_osi4iot/s3_storage_data'
				}
			}

			if (deploymentMode === "development") {
				osi4iotStackObj.volumes['pgadmin4_data'] = {
					driver: 'local',
					driver_opts: {
						type: 'nfs',
						o: `nfsvers=4,addr=${nfsServerIP},rw`,
						device: ':/var/nfs_osi4iot/pgadmin4_data'
					}
				}
			}
		} else if (storageSystem === "AWS EFS") {
			const efs_dns = osi4iotState.platformInfo.AWS_EFS_DNS;
			osi4iotStackObj.volumes['mosquitto_data'] = {
				driver: 'local',
				driver_opts: {
					type: 'nfs',
					o: `addr=${efs_dns},nfsvers=4.1,rsize=1048576,wsize=1048576,hard,timeo=600,retrans=2,noresvport`,
					device: `${efs_dns}:/mosquitto_data`
				}
			}

			osi4iotStackObj.volumes['mosquitto_log'] = {
				driver: 'local',
				driver_opts: {
					type: 'nfs',
					o: `addr=${efs_dns},nfsvers=4.1,rsize=1048576,wsize=1048576,hard,timeo=600,retrans=2,noresvport`,
					device: `${efs_dns}:/mosquitto_log`
				}
			}

			osi4iotStackObj.volumes['pgdata'] = {
				driver: 'local',
				driver_opts: {
					type: 'nfs',
					o: `addr=${efs_dns},nfsvers=4.1,rsize=1048576,wsize=1048576,hard,timeo=600,retrans=2,noresvport`,
					device: `${efs_dns}:/pgdata`
				}
			}

			osi4iotStackObj.volumes['timescaledb_data'] = {
				driver: 'local',
				driver_opts: {
					type: 'nfs',
					o: `addr=${efs_dns},nfsvers=4.1,rsize=1048576,wsize=1048576,hard,timeo=600,retrans=2,noresvport`,
					device: `${efs_dns}:/timescaledb_data`
				}
			}

			osi4iotStackObj.volumes['portainer_data'] = {
				driver: 'local',
				driver_opts: {
					type: 'nfs',
					o: `addr=${efs_dns},nfsvers=4.1,rsize=1048576,wsize=1048576,hard,timeo=600,retrans=2,noresvport`,
					device: `${efs_dns}:/portainer_data`
				}
			}

			osi4iotStackObj.volumes['grafana_data'] = {
				driver: 'local',
				driver_opts: {
					type: 'nfs',
					o: `addr=${efs_dns},nfsvers=4.1,rsize=1048576,wsize=1048576,hard,timeo=600,retrans=2,noresvport`,
					device: `${efs_dns}:/grafana_data`
				}
			}

			osi4iotStackObj.volumes['admin_api_log'] = {
				driver: 'local',
				driver_opts: {
					type: 'nfs',
					o: `addr=${efs_dns},nfsvers=4.1,rsize=1048576,wsize=1048576,hard,timeo=600,retrans=2,noresvport`,
					device: `${efs_dns}:/admin_api_log`
				}
			}

			osi4iotStackObj.volumes['s3_storage_data'] = {
				driver: 'local',
				driver_opts: {
					type: 'nfs',
					o: `addr=${efs_dns},nfsvers=4.1,rsize=1048576,wsize=1048576,hard,timeo=600,retrans=2,noresvport`,
					device: `${efs_dns}:/s3_storage_data`
				}
			}			

			if (deploymentMode === "development") {
				osi4iotStackObj.volumes['pgadmin4_data'] = {
					driver: 'local',
					driver_opts: {
						type: 'nfs',
						o: `addr=${efs_dns},nfsvers=4.1,rsize=1048576,wsize=1048576,hard,timeo=600,retrans=2,noresvport`,
						device: `${efs_dns}:/pgadmin4_data`
					}
				}
			}
		}
	}

	for (let iorg = 1; iorg <= osi4iotState.certs.mqtt_certs.organizations.length; iorg++) {
		const orgNodeRedInstanceHashes = [];
		const orgHash = osi4iotState.certs.mqtt_certs.organizations[iorg - 1].org_hash;
		const org_acronym = osi4iotState.certs.mqtt_certs.organizations[iorg - 1].org_acronym;
		const num_nodeRedInstances = osi4iotState.certs.mqtt_certs.organizations[iorg - 1].nodered_instances.length;
		const hasExclusiveOrgWorkerNodes = osi4iotState.certs.mqtt_certs.organizations[iorg - 1].exclusiveWorkerNodes.length !== 0;
		for (let idev = 1; idev <= num_nodeRedInstances; idev++) {
			const nodeRedInstanceHash = osi4iotState.certs.mqtt_certs.organizations[iorg - 1].nodered_instances[idev - 1].nri_hash;
			const isVolumeCreated = osi4iotState.certs.mqtt_certs.organizations[iorg - 1].nodered_instances[idev - 1].is_volume_created;
			orgNodeRedInstanceHashes.push(nodeRedInstanceHash);

			const serviceName = `org_${org_acronym}_nri_${nodeRedInstanceHash}`;
			const nodeRedInstanceHashPath = `nodered_${nodeRedInstanceHash}`
			osi4iotStackObj.services[serviceName] = {
				image: `ghcr.io/osi4iot/nodered_instance:${serviceImageVersion['nodered_instance']}`,
				user: "${UID}:${GID}",
				networks: [
					"internal_net",
					"traefik_public"
				],
				volumes: [
					`${serviceName}_data:/data`,
				],
				environment: [
					`TZ=${osi4iotState.platformInfo.DEFAULT_TIME_ZONE}`,
					`NODERED_INSTANCE_HASH=${nodeRedInstanceHash}`,
					`IS_NODERED_INSTANCE_VOLUME_ALREADY_CREATED=${isVolumeCreated === 'true'}`,
				],
				secrets: [
					{
						source: "mqtt_certs_ca_cert",
						target: "/data/certs/ca.crt",
						mode: 0o444
					},
					{
						source: `${serviceName}_mqtt_client_cert`,
						target: "/data/certs/client.crt",
						mode: 0o444
					},
					{
						source: `${serviceName}_mqtt_client_key`,
						target: "/data/certs/client.key",
						mode: 0o444
					}
				],
				deploy: {
					resources: {
						limits: {
							cpus: 0.50,
							memory: "512M"
						},
						reservations: {
							cpus: 0.25,
							memory: "128M"
						}
					},
					placement: {
						constraints: []
					},
					labels: [
						"traefik.enable=true",
						`traefik.http.routers.${serviceName}.rule=Host(\`${domainName}\`) && PathPrefix(\`/${nodeRedInstanceHashPath}/\`)`,
						`traefik.http.middlewares.${serviceName}-prefix.stripprefix.prefixes=/${nodeRedInstanceHashPath}`,
						`traefik.http.routers.${serviceName}.middlewares=${serviceName}-prefix,${serviceName}-header,${serviceName}-redirectregex`,
						`traefik.http.middlewares.${serviceName}-prefix.stripprefix.forceslash=false`,
						`traefik.http.middlewares.${serviceName}-header.headers.customrequestheaders.X-Script-Name=/${nodeRedInstanceHashPath}/`,
						`traefik.http.middlewares.${serviceName}-redirectregex.redirectregex.regex=${domainName}/(${nodeRedInstanceHashPath}*)`,
						`traefik.http.middlewares.${serviceName}-redirectregex.redirectregex.replacement=${domainName}/\$\${1}"`,
						`traefik.http.routers.${serviceName}.entrypoints=${entryPoint}`,
						`traefik.http.routers.${serviceName}.tls=true`,
						`traefik.http.routers.${serviceName}.service=${serviceName}`,
						`traefik.http.services.${serviceName}.loadbalancer.server.port=1880`
					]
				}
			}

			if (domainCertsType === "No certs" || domainCertsType === "AWS Certificate Manager") {
				osi4iotStackObj.services[serviceName].deploy.labels = [
					"traefik.enable=true",
					`traefik.http.routers.${serviceName}.rule=Host(\`${domainName}\`) && PathPrefix(\`/${nodeRedInstanceHashPath}/\`)`,
					`traefik.http.middlewares.${serviceName}-prefix.stripprefix.prefixes=/${nodeRedInstanceHashPath}`,
					`traefik.http.routers.${serviceName}.middlewares=${serviceName}-prefix,${serviceName}-header`,
					`traefik.http.middlewares.${serviceName}-prefix.stripprefix.forceslash=false`,
					`traefik.http.middlewares.${serviceName}-header.headers.customrequestheaders.X-Script-Name=/${nodeRedInstanceHashPath}/`,
					`traefik.http.routers.${serviceName}.entrypoints=web`,
					`traefik.http.routers.${serviceName}.service=${serviceName}`,
					`traefik.http.services.${serviceName}.loadbalancer.server.port=1880`
				]
			}

			const nodeRedInstanceVolume = `${serviceName}_data`;
			if (storageSystem === "NFS Server") {
				osi4iotStackObj.volumes[nodeRedInstanceVolume] = {
					driver: 'local',
					driver_opts: {
						type: 'nfs',
						o: `nfsvers=4,addr=${nfsServerIP},rw`,
						device: `:/var/nfs_osi4iot/${nodeRedInstanceVolume}`
					}
				}
			} else if (storageSystem === "AWS EFS") {
				const efs_dns = osi4iotState.platformInfo.AWS_EFS_DNS;
				osi4iotStackObj.volumes[nodeRedInstanceVolume] = {
					driver: 'local',
					driver_opts: {
						type: 'nfs',
						o: `addr=${efs_dns},nfsvers=4.1,rsize=1048576,wsize=1048576,hard,timeo=600,retrans=2,noresvport`,
						device: `${efs_dns}:/${nodeRedInstanceVolume}`
					}
				}
			} else if (storageSystem === "Local storage") {
				osi4iotStackObj.volumes[nodeRedInstanceVolume] = {
					driver: "local"
				};
			}

			if (numSwarmNodes > 1) {
				if (hasExclusiveOrgWorkerNodes) {
					osi4iotStackObj.services[serviceName].deploy.placement.constraints.push(`node.labels.org_hash==${orgHash}`);
				} else {
					osi4iotStackObj.services[serviceName].deploy.placement.constraints.push(`node.labels.generic_org_worker==true`)
				}
			}

			osi4iotStackObj.secrets[`${serviceName}_mqtt_client_cert`] = {
				file: `./certs/mqtt_certs/${serviceName}/client.crt`,
				name: osi4iotState.certs.mqtt_certs.organizations[iorg - 1].nodered_instances[idev - 1].client_crt_name
			}

			osi4iotStackObj.secrets[`${serviceName}_mqtt_client_key`] = {
				file: `./certs/mqtt_certs/${serviceName}/client.key`,
				name: osi4iotState.certs.mqtt_certs.organizations[iorg - 1].nodered_instances[idev - 1].client_key_name
			}
		}
	}

	const osi4iotStackYML = yaml.dump(osi4iotStackObj, {
		'styles': {
			'!!null': 'canonical', // dump null as ~
			'!!int': 'octal'
		},
		lineWidth: -1
	})
	fs.writeFileSync('./osi4iot_stack.yml', osi4iotStackYML);

	return osi4iotStackYML;
}