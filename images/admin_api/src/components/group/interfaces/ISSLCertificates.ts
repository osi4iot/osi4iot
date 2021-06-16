import { IsString } from "class-validator";

export default interface ISSLCertificates {
	caCert: string;
	clientCert: string;
	clientKey: string;
	validityDays: number;

}