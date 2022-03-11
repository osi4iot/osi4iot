import React, { createContext, FC, useContext, useReducer } from 'react';
import { ChildrenProp } from '../../interfaces/interfaces'
import { MasterDevicesContextProps } from './interfaces'
import { initialState, MasterDevicesReducer } from './masterDevicesReducer';


const MasterDevicesStateContext = createContext<MasterDevicesContextProps>(initialState);
const MasterDevicesDispatchContext = createContext<any>({});


export function useMasterDevicesDispatch() {
	const context = React.useContext(MasterDevicesDispatchContext);
	if (context === undefined) {
		throw new Error('useMasterDevicesDispatch must be used within a MasterDevicesProvider');
	}

	return context;
}

export const MasterDevicesProvider: FC<ChildrenProp> = ({ children }) => {
	const [user, masterDevicesDispatch] = useReducer(MasterDevicesReducer, initialState);

	return (
		<MasterDevicesStateContext.Provider value={user}>
			<MasterDevicesDispatchContext.Provider value={masterDevicesDispatch}>
				{children}
			</MasterDevicesDispatchContext.Provider>
		</MasterDevicesStateContext.Provider>
	);
};


export const useMasterDevicesOptionToShow = (): string => {
	const context = useContext(MasterDevicesStateContext);
	if (context === undefined) {
		throw new Error('useMasterDevicesOptionToShow must be used within a MasterDevicesProvider');
	}
	return context.masterDevicesOptionToShow;
}

