const getDomainUrl = (): string => {
	// const domainUrl = `https://${process.env.DOMAIN_NAME}`;
	const domainUrl = `http://${process.env.DOMAIN_NAME}`;
	return domainUrl;
}

export default getDomainUrl;