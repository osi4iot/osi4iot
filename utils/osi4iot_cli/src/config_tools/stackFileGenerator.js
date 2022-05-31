import yaml from 'js-yaml';
import fs from 'fs';

const defaultVersion = '1.1.0'

const defaultServiceImageVersion = {
	system_prune: defaultVersion || 'latest',
	traefik: defaultVersion || 'latest',
	mosquitto: defaultVersion || 'latest',
	agent: defaultVersion || 'latest',
	portainer: defaultVersion || 'latest',
	pgadmin4: defaultVersion || 'latest',
	postgres: defaultVersion || 'latest',
	nodered: defaultVersion || 'latest',
	grafana: defaultVersion || 'latest',
	grafana_renderer: defaultVersion || 'latest',
	admin_api: defaultVersion || 'latest',
	frontend: defaultVersion || 'latest',
	frontend_arm64: defaultVersion || 'latest',
	master_device: defaultVersion || 'latest',
	keepalived: defaultVersion || 'latest'
}

export default function (osi4iotState) {
	let existAtLeastOnex86_64ArchNode = false;
	let platformArch = 'x86_64';
	const nodesData = osi4iotState.platformInfo.NODES_DATA;
	const numSwarmNodes = nodesData.filter(node => node.nodeRole !== "NFS server").length;
	const numManagerNodes = nodesData.filter(node => node.nodeRole === "Manager").length;
	const existNFSServer = nodesData.filter(node => node.nodeRole === "NFS server").length !== 0;
	const domainCertsType = osi4iotState.platformInfo.DOMAIN_CERTS_TYPE;
	if (numSwarmNodes === 1) {
		const nodeArch = nodesData[0].nodeArch;
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
				command: [
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
					'--log',
				],
				deploy: {
					mode: 'replicated',
					replicas: 3,
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
						constraints: ["node.role==manager"]
					}
				},
				ports: [
					"80:80",
					"443:443",
					"8080:8080",
				],
				networks: [
					'traefik_public'
				],
				volumes: [
					'/var/run/docker.sock:/var/run/docker.sock:ro'
				]
			},
			mosquitto: {
				image: `ghcr.io/osi4iot/mosquitto:${serviceImageVersion['mosquitto']}`,
				networks: [
					'internal_net'
				],
				ports: [
					"1883:1883",
					"8883:8883",
					"9001:9001"
				],
				volumes: [
					'mosquitto_data:/mosquitto/data/',
					'mosquitto_log:/mosquitto/log/'
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
						target: '/mosquitto/config/mosquitto.conf',
						mode: 0o440
					}
				],
				deploy: {
					replicas: 1,
					placement: {
						constraints: workerConstraintsArray
					}
				}
			},
			agent: {
				image: `ghcr.io/osi4iot/portainer_agent:${serviceImageVersion['agent']}`,
				environment: [
					"AGENT_CLUSTER_ADDR=tasks.agent"
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
				volumes: [
					'portainer_data:/data'
				],
				ports: [
					"9000:9000"
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
						'traefik.http.routers.portainer.entrypoints=websecure',
						'traefik.http.routers.portainer.tls=true',
						'traefik.http.routers.portainer.service=portainer',
						'traefik.http.services.portainer.loadbalancer.server.port=9000'
					]
				}
			},
			pgadmin4: {
				image: `ghcr.io/osi4iot/pgadmin4:${serviceImageVersion['pgadmin4']}`,
				user: '${UID}:${GID}',
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
						`traefik.http.middlewares.pgadmin4-redirectregex.redirectregex.regex=https://${domainName}/(pgadmin4*)`,
						`traefik.http.middlewares.pgadmin4-redirectregex.redirectregex.replacement=https://${domainName}/\$\${1}"`,
						'traefik.http.routers.pgadmin4.entrypoints=websecure',
						'traefik.http.routers.pgadmin4.tls=true',
						'traefik.http.routers.pgadmin4.service=pgadmin4',
						'traefik.http.services.pgadmin4.loadbalancer.server.port=80'
					]
				}
			},
			postgres: {
				image: `ghcr.io/osi4iot/timescaledb:${serviceImageVersion['postgres']}`,
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
					'POSTGRES_DB=iot_platform_db',
					'POSTGRES_PASSWORD_FILE=/run/secrets/postgres_password.txt',
					'POSTGRES_USER_FILE=/run/secrets/postgres_user.txt'
				],
				deploy: {
					mode: 'replicated',
					replicas: 1,
					placement: {
						constraints: workerConstraintsArray
					}
				}
			},
			nodered: {
				image: `ghcr.io/osi4iot/nodered:${serviceImageVersion['nodered']}`,
				user: '${UID}:${GID}',
				networks: [
					'internal_net',
					'traefik_public'
				],
				volumes: [
					'nodered_data:/data'
				],
				environment: [
					`IS_NODERED_VOLUME_ALREADY_CREATED=${osi4iotState.platformInfo.IS_NODERED_VOLUME_ALREADY_CREATED === 'true'}`
				],
				secrets: [
					{
						source: 'mqtt_certs_ca_cert',
						target: '/data/certs/ca.crt',
						mode: 0o444
					},
					{
						source: 'mqtt_nodered_client_cert',
						target: '/data/certs/client.crt',
						mode: 0o444
					},
					{
						source: 'mqtt_nodered_client_key',
						target: '/data/certs/client.key',
						mode: 0o444
					},
					{
						source: 'nodered',
						target: 'nodered.txt',
						mode: 0o400
					}
				],
				configs: [
					{
						source: 'nodered_conf',
						target: '/run/configs/nodered.conf',
						mode: 0o440
					}
				],
				deploy: {
					placement: {
						constraints: workerConstraintsArray
					},
					labels: [
						'traefik.enable=true',
						`traefik.http.routers.nodered.rule=Host(\`${domainName}\`) && PathPrefix(\`/nodered/\`)`,
						'traefik.http.middlewares.nodered-prefix.stripprefix.prefixes=/nodered',
						'traefik.http.routers.nodered.middlewares=nodered-prefix,nodered-header,nodered-redirectregex',
						'traefik.http.middlewares.nodered-prefix.stripprefix.forceslash=false',
						'traefik.http.middlewares.nodered-header.headers.customrequestheaders.X-Script-Name=/nodered/',
						`traefik.http.middlewares.nodered-redirectregex.redirectregex.regex=https://${domainName}/(nodered*)`,
						`traefik.http.middlewares.nodered-redirectregex.redirectregex.replacement=https://${domainName}/\$\${1}"`,
						'traefik.http.routers.nodered.entrypoints=websecure',
						'traefik.http.routers.nodered.tls=true',
						'traefik.http.routers.nodered.service=nodered',
						'traefik.http.services.nodered.loadbalancer.server.port=1880'
					]
				}
			},
			grafana: {
				image: `ghcr.io/osi4iot/grafana:${serviceImageVersion['grafana']}`,
				user: '${UID}:${GID}',
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
					replicas: 3,
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
						constraints: ["node.role==manager"]
					},
					labels: [
						'traefik.enable=true',
						`traefik.http.routers.grafana.rule=Host(\`${domainName}\`) && PathPrefix(\`/grafana/\`)`,
						'traefik.http.middlewares.grafana-prefix.stripprefix.prefixes=/grafana',
						'traefik.http.routers.grafana.middlewares=grafana-prefix,grafana-header,grafana-redirectregex',
						'traefik.http.middlewares.grafana-prefix.stripprefix.forceslash=false',
						'traefik.http.middlewares.grafana-header.headers.customrequestheaders.X-Script-Name=/grafana/',
						`traefik.http.middlewares.grafana-redirectregex.redirectregex.regex=https://${domainName}/(grafana*)`,
						`traefik.http.middlewares.grafana-redirectregex.redirectregex.replacement=https://${domainName}/\$\${1}"`,
						'traefik.http.routers.grafana.entrypoints=websecure',
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
					}

				],
				ports: [
					'3200:3200'
				],
				environment: [
					'REPLICA={{.Task.Slot}}'
				],
				deploy: {
					mode: 'replicated',
					replicas: 3,
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
						`traefik.http.middlewares.admin_api-redirectregex.redirectregex.regex=https://${domainName}/(admin_api*)`,
						`traefik.http.middlewares.admin_api-redirectregex.redirectregex.replacement=https://${domainName}/\$\${1}"`,
						'traefik.http.routers.admin_api.entrypoints=websecure',
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
				image: platformArch === 'x86_64' ?
					`ghcr.io/osi4iot/frontend:${serviceImageVersion['frontend']}` :
					`ghcr.io/osi4iot/frontend_arm64:${serviceImageVersion['frontend_arm64']}`,
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
					replicas: 3,
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
						constraints: workerConstraintsArray
					},
					labels: [
						'traefik.enable=true',
						`traefik.http.routers.frontend.rule=Host(\`${domainName}\`)`,
						'traefik.http.routers.frontend.entrypoints=websecure',
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
			nodered_data: {
				driver: 'local'
			},
			pgdata: {
				driver: 'local'
			},
			pgadmin4_data: {
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
			mqtt_nodered_client_cert: {
				file: './certs/mqtt_certs/nodered/client.crt',
				name: osi4iotState.certs.mqtt_certs.nodered.mqtt_nodered_client_cert_name
			},
			mqtt_nodered_client_key: {
				file: './certs/mqtt_certs/nodered/client.key',
				name: osi4iotState.certs.mqtt_certs.nodered.mqtt_nodered_client_key_name
			},
			pgadmin4: {
				file: './secrets/pgadmin4.txt'
			},
			postgres_grafana: {
				file: './secrets/postgres_grafana.txt'
			},
			postgres_user: {
				file: './secrets/postgres_user.txt'
			},
			postgres_password: {
				file: './secrets/postgres_password.txt'
			},
			grafana: {
				file: './secrets/grafana.txt'
			},
			admin_api: {
				file: './secrets/admin_api.txt',
				name: osi4iotState.admin_api_secret_name
			},
			nodered: {
				file: './secrets/nodered.txt'
			}
		},
		configs: {
			mosquitto_conf: {
				file: './config/mosquitto/mosquitto.conf'
			},
			nodered_conf: {
				file: './config/nodered/nodered.conf'
			},
			grafana_conf: {
				file: './config/grafana/grafana.conf'
			},
			admin_api_conf: {
				file: './config/admin_api/admin_api.conf'
			},
			frontend_conf: {
				file: './config/frontend/frontend.conf'
			}
		}
	}

	if (domainCertsType === "Let's encrypt certs") {
		osi4iotStackObj.services['traefik'].image = `ghcr.io/osi4iot/traefik_le:${serviceImageVersion['traefik']}`;
		const platformAdminEmail = osi4iotState.platformInfo.PLATFORM_ADMIN_EMAIL;

		if (osi4iotState.platformInfo.DEPLOYMENT_LOCATION === "AWS cluster deployment") {
			osi4iotStackObj.services['traefik'].command.push(
				'--certificatesresolvers.osi4iot_resolver.acme.dnschallenge=true',
				'--certificatesresolvers.osi4iot_resolver.acme.httpchallenge=false',
				'--certificatesresolvers.osi4iot_resolver.acme.tlschallenge=false',
				'--certificatesresolvers.osi4iot_resolver.acme.dnschallenge.provider=route53',
				// '--certificatesresolvers.osi4iot_resolver.acme.caserver=https://acme-staging-v02.api.letsencrypt.org/directory',
				'--certificatesresolvers.osi4iot_resolver.acme.httpChallenge.entrypoint=web',
				`--certificatesresolvers.osi4iot_resolver.acme.email=${platformAdminEmail}`,
				'--certificatesresolvers.osi4iot_resolver.acme.storage=/letsencrypt/acme.json',
				//'--entrypoints.websocket.address=:9001',
			);
			osi4iotStackObj.services['traefik'].environment = [
				"AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID}",
				"AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY}"
			];
		}

		//osi4iotStackObj.services['traefik'].ports.push("9001");
		osi4iotStackObj.services['traefik'].volumes.push('letsencrypt:/letsencrypt');
		osi4iotStackObj.services['portainer'].deploy.labels.push("traefik.http.routers.portainer.tls.certresolver=osi4iot_resolver");
		osi4iotStackObj.services['pgadmin4'].deploy.labels.push("traefik.http.routers.pgadmin4.tls.certresolver=osi4iot_resolver");
		osi4iotStackObj.services['nodered'].deploy.labels.push("traefik.http.routers.nodered.tls.certresolver=osi4iot_resolver");
		osi4iotStackObj.services['grafana'].deploy.labels.push("traefik.http.routers.grafana.tls.certresolver=osi4iot_resolver");
		osi4iotStackObj.services['admin_api'].deploy.labels.push("traefik.http.routers.admin_api.tls.certresolver=osi4iot_resolver");
		osi4iotStackObj.services['frontend'].deploy.labels.push("traefik.http.routers.frontend.tls.certresolver=osi4iot_resolver");

		osi4iotStackObj.services['mosquitto'].ports = ["1883", "8883"];
		osi4iotStackObj.services['mosquitto'].deploy.labels = [
			"traefik.enable=true",
			`traefik.http.routers.mqtt_websocket.rule=Host(\`${domainName}\`) && PathPrefix(\`/mqtt/\`)`,
			"traefik.http.routers.mqtt_websocket.entrypoints=websecure",
			"traefik.http.routers.mqtt_websocket.tls.certresolver=osi4iot_resolver",
			"traefik.http.services.mqtt_websocket.loadbalancer.server.port=9001",
			// "traefik.http.routers.mqtt_websocket.service=mqtt_websocket"
		];

		osi4iotStackObj.volumes.letsencrypt = {
			driver: 'local'
		};
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

		if (domainCertsType === "Certs provided by an CA") {
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
		if (numManagerNodes > 1 && platformArch === 'x86_64') {
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

		if (existNFSServer) {
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

			osi4iotStackObj.volumes['nodered_data'] = {
				driver: 'local',
				driver_opts: {
					type: 'nfs',
					o: `nfsvers=4,addr=${nfsServerIP},rw`,
					device: ':/var/nfs_osi4iot/nodered_data'
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

			osi4iotStackObj.volumes['pgadmin4_data'] = {
				driver: 'local',
				driver_opts: {
					type: 'nfs',
					o: `nfsvers=4,addr=${nfsServerIP},rw`,
					device: ':/var/nfs_osi4iot/pgadmin4_data'
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

			if (domainCertsType === "Let's encrypt certs") {
				osi4iotStackObj.volumes['letsencrypt'] = {
					driver: 'local',
					driver_opts: {
						type: 'nfs',
						o: `nfsvers=4,addr=${nfsServerIP},rw`,
						device: ':/var/nfs_osi4iot/letsencrypt'
					}
				}
			}
		}
	}

	for (let iorg = 1; iorg <= osi4iotState.certs.mqtt_certs.organizations.length; iorg++) {
		const orgMasterDeviceHashes = [];
		const orgHash = osi4iotState.certs.mqtt_certs.organizations[iorg - 1].org_hash;
		const org_acronym = osi4iotState.certs.mqtt_certs.organizations[iorg - 1].org_acronym;
		const num_master_devices = osi4iotState.certs.mqtt_certs.organizations[iorg - 1].master_devices.length;
		const hasExclusiveOrgWorkerNodes = osi4iotState.certs.mqtt_certs.organizations[iorg - 1].exclusiveWorkerNodes.length !== 0;
		for (let idev = 1; idev <= num_master_devices; idev++) {
			const masterDeviceHash = osi4iotState.certs.mqtt_certs.organizations[iorg - 1].master_devices[idev - 1].md_hash;
			const isVolumeCreated = osi4iotState.certs.mqtt_certs.organizations[iorg - 1].master_devices[idev - 1].is_volume_created;
			orgMasterDeviceHashes.push(masterDeviceHash);

			const serviceName = `org_${org_acronym}_md_${masterDeviceHash}`;
			const masterDeviceHashPath = `master_device_${masterDeviceHash}`
			osi4iotStackObj.services[serviceName] = {
				image: `ghcr.io/osi4iot/master_device:${serviceImageVersion['master_device']}`,
				user: "${UID}:${GID}",
				networks: [
					"internal_net",
					"traefik_public"
				],
				volumes: [
					`${serviceName}_data:/data`
				],
				environment: [
					`MASTER_DEVICE_HASH=${masterDeviceHash}`,
					`IS_MASTER_DEVICE_VOLUME_ALREADY_CREATED=${isVolumeCreated === 'true'}`
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
					placement: {
						constraints: []
					},
					labels: [
						"traefik.enable=true",
						`traefik.http.routers.${serviceName}.rule=Host(\`${domainName}\`) && PathPrefix(\`/${masterDeviceHashPath}/\`)`,
						`traefik.http.middlewares.${serviceName}-prefix.stripprefix.prefixes=/${masterDeviceHashPath}`,
						`traefik.http.routers.${serviceName}.middlewares=${serviceName}-prefix,${serviceName}-header,${serviceName}-redirectregex`,
						`traefik.http.middlewares.${serviceName}-prefix.stripprefix.forceslash=false`,
						`traefik.http.middlewares.${serviceName}-header.headers.customrequestheaders.X-Script-Name=/${masterDeviceHashPath}/`,
						`traefik.http.middlewares.${serviceName}-redirectregex.redirectregex.regex=https://${domainName}/(${masterDeviceHashPath}*)`,
						`traefik.http.middlewares.${serviceName}-redirectregex.redirectregex.replacement=https://${domainName}/\$\${1}"`,
						`traefik.http.routers.${serviceName}.entrypoints=websecure`,
						`traefik.http.routers.${serviceName}.tls=true`,
						`traefik.http.routers.${serviceName}.service=${serviceName}`,
						`traefik.http.services.${serviceName}.loadbalancer.server.port=1880`
					]
				}
			}

			if (domainCertsType === "Let's encrypt certs") {
				osi4iotStackObj.services[serviceName].deploy.labels.push(`traefik.http.routers.${serviceName}.tls.certresolver=osi4iot_resolver`);
			}

			const masterDeviceVolume = `${serviceName}_data`;
			if (existNFSServer) {
				osi4iotStackObj.volumes[masterDeviceVolume] = {
					driver: 'local',
					driver_opts: {
						type: 'nfs',
						o: `nfsvers=4,addr=${nfsServerIP},rw`,
						device: `:/var/nfs_osi4iot/${masterDeviceVolume}`
					}
				}
			} else {
				osi4iotStackObj.volumes[masterDeviceVolume] = {
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
				name: osi4iotState.certs.mqtt_certs.organizations[iorg - 1].master_devices[idev - 1].client_crt_name
			}

			osi4iotStackObj.secrets[`${serviceName}_mqtt_client_key`] = {
				file: `./certs/mqtt_certs/${serviceName}/client.key`,
				name: osi4iotState.certs.mqtt_certs.organizations[iorg - 1].master_devices[idev - 1].client_key_name
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