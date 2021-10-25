import process_env from "../../config/api_config";

const getDomainUrl = (): string => {
	const domainUrl = `https://${process_env.DOMAIN_NAME}`;
	return domainUrl;
}

export default getDomainUrl;