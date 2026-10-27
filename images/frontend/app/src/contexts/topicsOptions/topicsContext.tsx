import { FC } from 'react';
import { ChildrenProp } from '../../interfaces/interfaces'
import { TopicsContextProps } from './interfaces'
import { initialState, TopicsReducer } from './topicsReducer';
import { createSectionStore, SectionStoreProvider } from '../../state/createSectionStore';

// Estado de la sección en un almacén Zustand global (antes Context + useReducer): se conserva al cambiar de capa
const useTopicsStore = createSectionStore(TopicsReducer, initialState);

export function useTopicsDispatch() {
	return useTopicsStore.dispatch;
}

export const TopicsProvider: FC<ChildrenProp> = ({ children }) => (
	<SectionStoreProvider store={useTopicsStore}>{children}</SectionStoreProvider>
);

export const useTopicsOptionToShow = (): string => {
	return useTopicsStore((state) => state.topicsOptionToShow);
}

export const useTopicIdToEdit = (): number => {
	return useTopicsStore((state) => state.topicIdToEdit);
}

export const useTopicRowIndexToEdit = (): number => {
	return useTopicsStore((state) => state.topicRowIndexToEdit);
}
