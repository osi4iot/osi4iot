import {
	connect,
	NatsConnection,
	JetStreamClient,
	StorageType,
	RetentionPolicy,
	StringCodec,
	ConnectionOptions,
	JetStreamManager,
	Codec,
	StreamConfig,
	PubAck,
} from "nats";
import process_env from "./api_config";
import { logger } from "./winston";

export interface AdminMsgContext {
	groupId?: number;
	digitalTwinId?: number;
	assetId?: number;
	topicId?: number;
	topicRef?: string;
	fileName?: string;
	updatedField?: string;
}

export interface Nats {
	nc: NatsConnection;
	js: JetStreamClient;
}

class NATSClient {
	private static instance: NATSClient | null = null;

	private connection: NatsConnection | null;
	private jetstream: JetStreamClient | null;
	private jetstreamManager: any | null;
	private stringCodec: any;
	private isConnected: boolean;
	private isConnecting: boolean;
	private connectionPromise: Promise<NatsConnection> | null;
	private config: any;
	private STREAM_NAME = "PIPELINES_SHARD_1";

	constructor() {
		if (NATSClient.instance) {
			return NATSClient.instance;
		}

		this.connection = null;
		this.jetstream = null;
		this.jetstreamManager = null;
		this.stringCodec = StringCodec();
		this.isConnected = false;
		this.isConnecting = false;
		this.connectionPromise = null;

		const numNatsNodes = parseInt(process_env.NATS_NUM_NODES, 10);
		const numNatsReplicas = parseInt(process_env.NATS_NUM_REPLICAS, 10);
		const numSeedServers = Math.min(numNatsReplicas, 3);
		const serversUrl = [];
		if (numNatsNodes === 1) {
			for (let replica = 1; replica <= numSeedServers; replica++) {
				const port = 4222 + (replica - 1);
				serversUrl.push(`nats://nats${replica}.${process_env.DOMAIN_NAME}:${port}`);
			}
		} else if (numNatsNodes >= 3) {
			for (let replica = 1; replica <= numSeedServers; replica++) {
				serversUrl.push(`nats://nats${replica}.${process_env.DOMAIN_NAME}:4222`);
			}
		}

		this.config = {
			servers: serversUrl,
			pass: process_env.PLATFORM_ADMIN_PASSWORD,
			user: process_env.PLATFORM_ADMIN_USER_NAME,
			reconnect: true,
			maxReconnectAttempts: -1,
			reconnectTimeWait: 1000,
			pingInterval: 30000,
			maxPingOut: 2,
			// tls: tlsOptions
		};

		NATSClient.instance = this;
	}

	async connect(customConfig = {}) {
		if (this.isConnected) {
			return this.connection;
		}

		if (this.isConnecting) {
			return this.connectionPromise;
		}

		this.isConnecting = true;

		try {
			this.connectionPromise = this._establishConnection({ ...this.config, ...customConfig });
			this.connection = await this.connectionPromise;

			this.jetstream = this.connection.jetstream();
			this.jetstreamManager = await this.connection.jetstreamManager();

			this.isConnected = true;
			this.isConnecting = false;

			logger.log("info", "NATS client connected successfully");

			this._setupEventListeners();
			await this.createOrUpdateStream();

			return this.connection;
		} catch (error) {
			this.isConnecting = false;
			this.connectionPromise = null;
			logger.log("error", "Error connecting to NATS:", error);
			throw error;
		}
	}

	async _establishConnection(config: ConnectionOptions) {
		return await connect(config);
	}

	_setupEventListeners() {
		if (!this.connection) return;

		void this.connection.closed().then((err) => {
			this.isConnected = false;
			if (err) {
				logger.log("error", "NATS connection closed with error:", err);
			} else {
				logger.log("info", "NATS connection closed normally");
			}
		});

		void (async () => {
			for await (const status of this.connection.status()) {
				if (status.type === "reconnect") {
					logger.log("info", "NATS reconnected");
					this.isConnected = true;
				} else if (status.type === "disconnect") {
					logger.log("warn", "NATS disconnected");
					this.isConnected = false;
				}
			}
		})();
	}

	getJetStream() {
		if (!this.isConnected || !this.jetstream) {
			throw new Error("Client NATS not connected. Call connect() first.");
		}
		return this.jetstream;
	}

	getJetStreamManager(): JetStreamManager {
		if (!this.isConnected || !this.jetstreamManager) {
			throw new Error("Client NATS not connected. Call connect() first.");
		}
		return this.jetstreamManager as JetStreamManager;
	}

	getConnection(): NatsConnection {
		if (!this.isConnected || !this.connection) {
			throw new Error("Client NATS not connected. Call connect() first.");
		}
		return this.connection;
	}

	getStringCodec(): Codec<string> {
		return this.stringCodec as Codec<string>;
	}

	async jsPublish(component: string, action: string, id: number, context?: AdminMsgContext | null): Promise<PubAck> {
		const js = this.getJetStream();
		const adminMsg = {
			component,
			action,
			id,
			context,
		};

		const subject = "pipelines_shard_1.admin";
		try {
			const ack = await js.publish(subject, this.stringCodec.encode(JSON.stringify(adminMsg)));
			return ack;
		} catch (error) {
			logger.log("error", `Error publishing to '${subject}':`, error);
			throw error;
		}
	}

	publish(subject: string, message: any): void {
		const nc = this.getConnection();
		try {
			nc.publish(subject, this.stringCodec.encode(message));
		} catch (error) {
			logger.log("error", `Error publishing to '${subject}':`, error);
			throw error;
		}
	}

	subscribe(subject: string, callback: (msg: any) => void): void {
		const nc = this.getConnection();
		nc.subscribe(subject, {
			callback: (err, msg) => {
				if (err) {
					logger.log("error", `Error receiving message on '${subject}':`, err);
				} else {
					const message = this.stringCodec.decode(msg.data);
					callback(message);
				}
			},
		});
	}

	async createOrUpdateStream() {
		const jsm = this.getJetStreamManager();

		const streamConfig: Partial<StreamConfig> = {
			name: this.STREAM_NAME,
			subjects: ["pipelines_shard_1.admin", "pipelines_shard_1.admin.>"],
			retention: RetentionPolicy.Limits,
			max_msgs: 1000,
			max_age: 60 * 60 * 2 * 1000000000, // 2 horas in nanoseconds
			storage: StorageType.File,
		};

		try {
			await jsm.streams.add(streamConfig);
			logger.log("info", `Stream '${streamConfig.name}' created/updated successfully`);
			return true;
		} catch (error: any) {
			if (error.message.includes("stream name already in use")) {
				logger.log("info", `Stream '${streamConfig.name}' already exists`);
				return true;
			}
			logger.log("error", `Error creating stream '${streamConfig.name}':`, error);
			throw error;
		}
	}

	async deleteKvStore(kvStoreName: string): Promise<void> {
		const kv = await this.jetstream.views.kv(kvStoreName);
		if (!kv) {
			logger.log("warn", `KV store '${kvStoreName}' does not exist`);
			return;
		}
		await kv.destroy();
	}

	isClientConnected() {
		return this.isConnected;
	}

	async close() {
		if (this.connection && !this.connection.isClosed()) {
			await this.connection.close();
			this.isConnected = false;
			this.connection = null;
			this.jetstream = null;
			this.jetstreamManager = null;
			logger.log("info", "NATS connection closed");
		}
	}

	static reset() {
		if (NATSClient.instance) {
			void NATSClient.instance.close();
			NATSClient.instance = null;
		}
	}
}

const natsClient = new NATSClient();

export default natsClient;
export { NATSClient };
