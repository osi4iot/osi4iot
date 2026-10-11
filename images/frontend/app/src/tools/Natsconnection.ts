import { connect, NatsConnection, StringCodec } from "nats.ws";
import { getDomainName, getNatsSeedServers } from "./tools";

const sc = StringCodec();

const NatsConnect = async (
	setIsNatsConnected: React.Dispatch<React.SetStateAction<boolean>>,
	userName: string,
	accessToken: string
): Promise<NatsConnection> => {
	const natsSeedServers = getNatsSeedServers();
	const urls = natsSeedServers.split(",").map((s: string) => s.trim());

	try {
		const nc = await connect({
			servers: urls,
			user: `jwt_${userName}`,
			pass: accessToken,
		});

		setIsNatsConnected(true);

		// Monitor connection status in background
		(async () => {
			for await (const s of nc.status()) {
				if (s.type === "disconnect" || s.type === "error") {
					setIsNatsConnected(false);
					console.log("NATS connection lost:", s);
				} else if (s.type === "reconnect") {
					setIsNatsConnected(true);
					console.log("NATS reconnected");
				}
			}
		})().catch((err) => console.log("NATS status monitor error:", err));

		nc.closed().then(() => {
			setIsNatsConnected(false);
			console.log("NATS connection closed");
		});

		return nc;
	} catch (err) {
		setIsNatsConnected(false);
		console.log("NATS connection failed:", err);
		throw err;
	}
};

export { sc };
export default NatsConnect;