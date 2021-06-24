import React, { createContext, FC, useContext, useReducer } from 'react';
import { ChildrenProp } from '../../interfaces/interfaces'
import { DigitalTwinsContextProps } from './interfaces'
import { initialState, DigitalTwinsReducer } from './digitalTwinsReducer';


const DigitalTwinsStateContext = createContext<DigitalTwinsContextProps>(initialState);
const DigitalTwinsDispatchContext = createContext<any>({});


export function useDigitalTwinsDispatch() {
	const context = React.useContext(DigitalTwinsDispatchContext);
	if (context === undefined) {
		throw new Error('useDigitalTwinsDispatch must be used within a DigitalTwinsProvider');
	}

	return context;
}

export const DigitalTwinsProvider: FC<ChildrenProp> = ({ children }) => {
	const [user, digitalTwinsDispatch] = useReducer(DigitalTwinsReducer, initialState);

	return (
		<DigitalTwinsStateContext.Provider value={user}>
			<DigitalTwinsDispatchContext.Provider value={digitalTwinsDispatch}>
				{children}
			</DigitalTwinsDispatchContext.Provider>
		</DigitalTwinsStateContext.Provider>
	);
};


export const useDigitalTwinsOptionToShow = (): string => {
	const context = useContext(DigitalTwinsStateContext);
	if (context === undefined) {
		throw new Error('useDigitalTwinsOptionToShow must be used within a DigitalTwinsProvider');
	}
	return context.digitalTwinsOptionToShow;
}

export const useDigitalTwinIdToEdit = (): number => {
	const context = useContext(DigitalTwinsStateContext);
	if (context === undefined) {
		throw new Error('useDigitalTwinIdToEdit must be used within a DigitalTwinsProvider');
	}
	return context.digitalTwinIdToEdit;
}

export const useDigitalTwinRowIndexToEdit = (): number => {
	const context = useContext(DigitalTwinsStateContext);
	if (context === undefined) {
		throw new Error('useDigitalTwinRowIndexToEdit must be used within a DigitalTwinsProvider');
	}
	return context.digitalTwinRowIndexToEdit;
}
