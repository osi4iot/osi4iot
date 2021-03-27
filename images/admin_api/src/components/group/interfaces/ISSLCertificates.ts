import { IsString } from "class-validator";

class ISSLCertificates {
	public caCert: string;
	public clientCert: string;
	public clientKey: string;

}

export default ISSLCertificates;