import { FC, useEffect } from 'react'
import { IFemSimulationObject } from './Model';
import { FemSimulationObjectState, IDigitalTwinGltfData, loadJsonModel } from './ViewerUtils';


interface SetFemSimulationObjectProps {
    digitalTwinGltfData: IDigitalTwinGltfData;
    setFemSimulationObjects: (femSimulationObject: IFemSimulationObject | null) => void;
    setInitialFemSimulationObjectState: (initialFemSimulationObjectState: FemSimulationObjectState) => void;

}


const SetFemSimulationObject: FC<SetFemSimulationObjectProps> = ({
    digitalTwinGltfData,
    setFemSimulationObjects,
    setInitialFemSimulationObjectState,
}) => {

    useEffect(() => {
        loadJsonModel(digitalTwinGltfData, setFemSimulationObjects, setInitialFemSimulationObjectState);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    return null;
}

export default SetFemSimulationObject;