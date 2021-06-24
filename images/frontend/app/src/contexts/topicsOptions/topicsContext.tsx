import React, { createContext, FC, useContext, useReducer } from 'react';
import { ChildrenProp } from '../../interfaces/interfaces'
import { TopicsContextProps } from './interfaces'
import { initialState, TopicsReducer } from './topicsReducer';


const TopicsStateContext = createContext<TopicsContextProps>(initialState);
const TopicsDispatchContext = createContext<any>({});


export function useTopicsDispatch() {
	const context = React.useContext(TopicsDispatchContext);
	if (context === undefined) {
		throw new Error('useTopicsDispatch must be used within a TopicsProvider');
	}

	return context;
}

export const TopicsProvider: FC<ChildrenProp> = ({ children }) => {
	const [user, topicsDispatch] = useReducer(TopicsReducer, initialState);

	return (
		<TopicsStateContext.Provider value={user}>
			<TopicsDispatchContext.Provider value={topicsDispatch}>
				{children}
			</TopicsDispatchContext.Provider>
		</TopicsStateContext.Provider>
	);
};


export const useTopicsOptionToShow = (): string => {
	const context = useContext(TopicsStateContext);
	if (context === undefined) {
		throw new Error('useTopicsOptionToShow must be used within a TopicsProvider');
	}
	return context.topicsOptionToShow;
}

export const useTopicIdToEdit = (): number => {
	const context = useContext(TopicsStateContext);
	if (context === undefined) {
		throw new Error('useTopicIdToEdit must be used within a TopicsProvider');
	}
	return context.topicIdToEdit;
}

export const useTopicRowIndexToEdit = (): number => {
	const context = useContext(TopicsStateContext);
	if (context === undefined) {
		throw new Error('useTopicRowIndexToEdit must be used within a TopicsProvider');
	}
	return context.topicRowIndexToEdit;
}
