import crypto from "crypto";
import Hash from "./hash.interface";

const algorithm = "aes-256-ctr";
const secretKey = process.env.ENCRYPTION_SECRET_KEY;
const iv = crypto.randomBytes(16);

export const encrypt = (text: string): string => {
	const cipher = crypto.createCipheriv(algorithm, secretKey, iv);
	const encrypted = Buffer.concat([cipher.update(text), cipher.final()]);
	const hashObj = {
		iv: iv.toString("hex"),
		content: encrypted.toString("hex"),
	};
	const encryptedText = Buffer.from(JSON.stringify(hashObj)).toString("base64");
	return encryptedText;
};

export const decrypt = (encryptedText: string): string => {
	const hashedText = Buffer.from(encryptedText, "base64").toString('ascii');;
	const hash: Hash = JSON.parse(hashedText);
	const decipher = crypto.createDecipheriv(algorithm, secretKey, Buffer.from(hash.iv, "hex"));
	const decrpyted = Buffer.concat([decipher.update(Buffer.from(hash.content, "hex")), decipher.final()]);
	return decrpyted.toString();
};
