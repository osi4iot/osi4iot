import { FC } from 'react';
import { ChildrenProp } from '../../interfaces/interfaces'
import { DigitalTwinsContextProps } from './interfaces'
import { initialState, DigitalTwinsReducer } from './digitalTwinsReducer';
import { createSectionStore, SectionStoreProvider } from '../../state/createSectionStore';

// Estado de la sección en un almacén Zustand global (antes Context + useReducer): se conserva al cambiar de capa
const useDigitalTwinsStore = createSectionStore(DigitalTwinsReducer, initialState);

export function useDigitalTwinsDispatch() {
	return useDigitalTwinsStore.dispatch;
}

export const DigitalTwinsProvider: FC<ChildrenProp> = ({ children }) => (
	<SectionStoreProvider store={useDigitalTwinsStore}>{children}</SectionStoreProvider>
);

export const useDigitalTwinsOptionToShow = (): string => {
	return useDigitalTwinsStore((state) => state.digitalTwinsOptionToShow);
}

export const useDigitalTwinIdToEdit = (): number => {
	return useDigitalTwinsStore((state) => state.digitalTwinIdToEdit);
}

export const useDigitalTwinRowIndexToEdit = (): number => {
	return useDigitalTwinsStore((state) => state.digitalTwinRowIndexToEdit);
}
