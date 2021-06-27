const getDomainUrl = (): string => {
	const domainUrl = `https://${process.env.DOMAIN_NAME}`;
	return domainUrl;
}

export default getDomainUrl;