import { FC } from 'react';
import styled from "styled-components";
import { getDomainName } from '../../tools/tools';


const PlatformToolsContainer = styled.div`
    width: 90%;
    height: 90%;
    padding: 1rem;
    background-color: #202226;
    margin: 20px;
    padding: 20px;
    display: flex;
    flex-direction: row;
    justify-content: center;
    align-items: center;
    flex-wrap: wrap;
`

const ImageContainer = styled.div`
    background-color: #202226;
    width: 250px;
    display: flex;
    justify-content: center;
    align-items: center;
    margin: 50px;
    padding: 5px;
    border: 1px solid #202226;

    &:hover {
		border: 1px solid white;
		cursor: pointer;
	}
`;

const ToolImage = styled.img`
    display: block;
    width: 100%;
	object-fit: contain;
`;

const domainName = getDomainName();

const PlatformTools: FC<{}> = () => {

	const handleLinkClick = (path: string) => {
		const url = `https://${domainName}${path}`;
		window.open(url, "_blank");
    };
    
    const handleExternalLinkClick = (url: string) => {
		window.open(url, "_blank");
	};

    return (
        <PlatformToolsContainer>
            <ImageContainer onClick={() => handleLinkClick("/nodered/")} >
                <ToolImage src="../images/platformTools/node-red.png" alt="Node-Red" />
            </ImageContainer>
            <ImageContainer onClick={() => handleLinkClick("/pgadmin4/")} >
                <ToolImage src="../images/platformTools/pgadmin4.png" alt="Pgadmin4" />
            </ImageContainer>
            <ImageContainer onClick={() => handleLinkClick("/portainer/")} >
                <ToolImage src="../images/platformTools/portainer.png" alt="Portainer" />
            </ImageContainer>
            <ImageContainer onClick={() => handleLinkClick("/admin_api/swagger/")}>
                <ToolImage src="../images/platformTools/swagger.png" alt="Swagger" />
            </ImageContainer>
            <ImageContainer onClick={() => handleExternalLinkClick("https://geojson.io/")}>
                <ToolImage src="../images/platformTools/geojson-io.png" alt="geoson.io" />
            </ImageContainer>
        </PlatformToolsContainer>
    )
}

export default PlatformTools;