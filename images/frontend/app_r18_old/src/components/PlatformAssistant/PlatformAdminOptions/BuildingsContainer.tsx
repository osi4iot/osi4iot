import React, { FC, useCallback } from 'react'
import TableWithPagination from '../Utils/TableWithPagination';
import { BUILDINGS_OPTIONS } from '../Utils/platformAssistantOptions';
import { IBuilding, Create_BUILDINGS_COLUMNS } from '../TableColumns/buildingsColumns';
import { setBuildingsOptionToShow, useBuildingsDispatch, useBuildingsOptionToShow } from '../../../contexts/buildingsOptions';
import CreateBuilding from './CreateBuilding';
import EditBuilding from './EditBuilding';


interface BuildingsContainerProps {
    buildings: IBuilding[];
    refreshBuildings: () => void;
}


const BuildingsContainer: FC<BuildingsContainerProps> = ({ buildings, refreshBuildings }) => {
    const buildingsDispatch = useBuildingsDispatch();
    const buildingsOptionToShow = useBuildingsOptionToShow();

    const showBuildingsTableOption = useCallback(() => {
        setBuildingsOptionToShow(buildingsDispatch, { buildingsOptionToShow: BUILDINGS_OPTIONS.TABLE });
    }, [buildingsDispatch]);

    return (
        <>
            {buildingsOptionToShow === BUILDINGS_OPTIONS.CREATE_BUILDING &&
                <CreateBuilding
                    backToTable={showBuildingsTableOption}
                    refreshBuildings={refreshBuildings}
                />
            }
            {buildingsOptionToShow === BUILDINGS_OPTIONS.EDIT_BUILDING &&
                <EditBuilding
                    buildings={buildings}
                    refreshBuildings={refreshBuildings}
                    backToTable={showBuildingsTableOption}
                />
            }
            {buildingsOptionToShow === BUILDINGS_OPTIONS.TABLE &&
                <TableWithPagination
                    dataTable={buildings}
                    columnsTable={Create_BUILDINGS_COLUMNS(refreshBuildings)}
                    componentName="building"
                    reloadTable={refreshBuildings}
                    createComponent={() => setBuildingsOptionToShow(buildingsDispatch, { buildingsOptionToShow: BUILDINGS_OPTIONS.CREATE_BUILDING })}
                />
            }
        </>
    )
}

export default BuildingsContainer;