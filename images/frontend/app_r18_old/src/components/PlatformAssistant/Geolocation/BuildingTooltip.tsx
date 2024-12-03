import { FC } from "react";
import { StyledTooltip as Tooltip } from './Tooltip';
import styled from "styled-components";
import { IOrgManaged } from "../TableColumns/organizationsManagedColumns";
import { StatusLed } from "./StatusLed";

export interface IOrgManagedWithStatus extends IOrgManaged {
    orgStatus: string;
}

const Ul = styled.ul`
    list-style-type: none;
    margin: 0;
    padding: 0;

    li {
        margin: 5px 0;
    }
`;

interface BuildingTooltipProps {
    buildingName: string;
    orgsInBuilding: IOrgManagedWithStatus[];
    orgSelected: IOrgManaged | null;
}

const BuildingTooltip: FC<BuildingTooltipProps> = ({ buildingName, orgsInBuilding, orgSelected }) => {
    let orgAcronym = orgsInBuilding[0]?.acronym;
    let orgStatus = orgsInBuilding[0]?.orgStatus;
    let orgRole = "";
    if (orgSelected) {
        orgAcronym = orgSelected.acronym;
        orgStatus = orgsInBuilding.filter(org => org.id === orgSelected.id)[0]?.orgStatus;
        orgRole = `(${orgsInBuilding.filter(org => org.id === orgSelected.id)[0]?.role} org) `;
    }

    return (
        <>
            {
                (orgsInBuilding.length === 1 || orgSelected) ?
                    <Tooltip sticky opacity={1}>
                        <div>
                            <span style={{ fontWeight: 'bold' }}>Org:</span>
                            {` ${orgAcronym} ${orgRole}`}<StatusLed status={orgStatus} size="8px" />
                        </div>
                    </Tooltip>
                    :
                    <Tooltip sticky opacity={1}>
                        <div>
                            <span style={{ fontWeight: 600 }}>Building:</span>{` ${buildingName}`}
                        </div>
                        {orgsInBuilding.length !== 0 ?
                            <>
                                <div>
                                    <span style={{ fontWeight: 600 }}>Orgs in building:</span>
                                </div>
                                <Ul>
                                    {
                                        orgsInBuilding.map(org =>
                                            <li key={org.id}>{` ${org.acronym} (${org.role} org) `}<StatusLed status={org.orgStatus} size="8px" /></li>
                                        )
                                    }
                                </Ul>
                            </>
                            :
                            null
                        }
                    </Tooltip>
            }
        </>
    )
}

export default BuildingTooltip;