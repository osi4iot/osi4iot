import { createUser } from "@nats-io/nkeys";

export const generateNatsNKeys = () => {
	const user = createUser();
	const seed = user.getSeed();
	const seedKey = new TextDecoder().decode(seed);
	const publicKey = user.getPublicKey();

	return { seedKey, publicKey };
};


