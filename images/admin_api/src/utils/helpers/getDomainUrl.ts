import process_env from "../../config/api_config";

const getDomainUrl = (): string => {
	const domainUrl = `${process_env.PROTOCOL}://${process_env.DOMAIN_NAME}`;
	return domainUrl;
}

export default getDomainUrl;