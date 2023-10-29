import React, { FC, useCallback } from 'react'
import TableWithPagination from '../Utils/TableWithPagination';
import { FLOORS_OPTIONS } from '../Utils/platformAssistantOptions';
import CreateFloor from './CreateFloor';
import EditFloor from './EditFloor';
import { setFloorsOptionToShow, useFloorsDispatch, useFloorsOptionToShow } from '../../../contexts/floorsOptions';
import { IFloor, Create_FLOORS_COLUMNS } from '../TableColumns/floorsColumns';


interface FloorsContainerProps {
    floors: IFloor[];
    refreshFloors: () => void;
}


const FloorsContainer: FC<FloorsContainerProps> = ({ floors, refreshFloors }) => {
    const floorsDispatch = useFloorsDispatch();
    const floorsOptionToShow = useFloorsOptionToShow();

    const showFloorsTableOption = useCallback(() => {
        setFloorsOptionToShow(floorsDispatch, { floorsOptionToShow: FLOORS_OPTIONS.TABLE });
    }, [floorsDispatch]);

    return (
        <>
            {floorsOptionToShow === FLOORS_OPTIONS.CREATE_FLOOR &&
                <CreateFloor
                    backToTable={showFloorsTableOption}
                    refreshFloors={refreshFloors}
                />
            }
            {floorsOptionToShow === FLOORS_OPTIONS.EDIT_FLOOR &&
                <EditFloor
                    floors={floors}
                    refreshFloors={refreshFloors}
                    backToTable={showFloorsTableOption}
                />
            }
            {floorsOptionToShow === FLOORS_OPTIONS.TABLE &&
                <TableWithPagination
                    dataTable={floors}
                    columnsTable={Create_FLOORS_COLUMNS(refreshFloors)}
                    componentName="floor"
                    reloadTable={refreshFloors}
                    createComponent={() => setFloorsOptionToShow(floorsDispatch, { floorsOptionToShow: FLOORS_OPTIONS.CREATE_FLOOR })}
                />
            }
        </>
    )
}

export default FloorsContainer;