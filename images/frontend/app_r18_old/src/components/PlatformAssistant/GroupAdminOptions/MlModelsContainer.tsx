import React, { FC } from 'react'
import TableWithPagination from '../Utils/TableWithPagination';
import { ML_MODELS_OPTIONS } from '../Utils/platformAssistantOptions';
import { Create_ML_MODELS_COLUMNS, IMlModel } from '../TableColumns/mlModelsColumns';
import { setMlModelsOptionToShow, useMlModelsDispatch, useMlModelsOptionToShow } from '../../../contexts/mlModelsOptions';
import CreateMlModel from './CreateMlModel';
import EditMlModel from './EditMlModel';

interface MlModelsContainerProps {
    mlModels: IMlModel[];
    refreshMlModels: () => void;
}

const MlModelsContainer: FC<MlModelsContainerProps> = ({ mlModels, refreshMlModels }) => {
    const mlModelsDispatch = useMlModelsDispatch();
    const mlModelsOptionToShow = useMlModelsOptionToShow();

    const showhMlModelsTableOption = () => {
        setMlModelsOptionToShow(mlModelsDispatch, { mlModelsOptionToShow: ML_MODELS_OPTIONS.TABLE });
    }

    return (
        <>
            {mlModelsOptionToShow === ML_MODELS_OPTIONS.CREATE_ML_MODEL && <CreateMlModel backToTable={showhMlModelsTableOption} refreshMlModels={refreshMlModels} />}
            {mlModelsOptionToShow === ML_MODELS_OPTIONS.EDIT_ML_MODEL && <EditMlModel mlModels={mlModels} backToTable={showhMlModelsTableOption} refreshMlModels={refreshMlModels} />}
            { mlModelsOptionToShow === ML_MODELS_OPTIONS.TABLE &&
                <TableWithPagination
                    dataTable={mlModels}
                    columnsTable={Create_ML_MODELS_COLUMNS(refreshMlModels)}
                    componentName="ML model"
                    reloadTable={refreshMlModels}
                    createComponent={() => setMlModelsOptionToShow(mlModelsDispatch, { mlModelsOptionToShow: ML_MODELS_OPTIONS.CREATE_ML_MODEL })}
                />
            }
        </>
    )
}

export default MlModelsContainer;