export default interface ISSLCertificates {
	username: string,
	password: string;
	caCert: string;
	clientCert: string;
	clientKey: string;
	validityDays: number;

}