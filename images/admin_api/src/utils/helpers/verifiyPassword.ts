import crypto from 'crypto';

const verifiyPassword = (password: string, matchHash: string, salt: string): boolean => {
	const iterations = 10000;
	const userHash = crypto.pbkdf2Sync(password, salt, iterations, 50, 'sha256');
	return userHash.toString('hex') === matchHash;
}

export default verifiyPassword;