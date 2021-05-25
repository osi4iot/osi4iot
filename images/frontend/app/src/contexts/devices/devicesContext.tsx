import React, { createContext, FC, useContext, useReducer } from 'react';
import { ChildrenProp } from '../../interfaces/interfaces'
import { DevicesContextProps } from './interfaces'
import { initialState, DevicesReducer } from './devicesReducer';


const DevicesStateContext = createContext<DevicesContextProps>(initialState);
const DevicesDispatchContext = createContext<any>({});


export function useDevicesDispatch() {
	const context = React.useContext(DevicesDispatchContext);
	if (context === undefined) {
		throw new Error('usePlatformAssitantDispatch must be used within a AuthProvider');
	}

	return context;
}

export const DevicesProvider: FC<ChildrenProp> = ({ children }) => {
	const [user, devicesDispatch] = useReducer(DevicesReducer, initialState);

	return (
		<DevicesStateContext.Provider value={user}>
			<DevicesDispatchContext.Provider value={devicesDispatch}>
				{children}
			</DevicesDispatchContext.Provider>
		</DevicesStateContext.Provider>
	);
};


export const useDevicesOptionToShow = (): string => {
	const context = useContext(DevicesStateContext);
	if (context === undefined) {
		throw new Error('useDevicesOptionToShow must be used within a DevicesProvider');
	}
	return context.devicesOptionToShow;
}

export const useDeviceIdToEdit = (): number => {
	const context = useContext(DevicesStateContext);
	if (context === undefined) {
		throw new Error('useDeviceIdToEdit must be used within a DevicesProvider');
	}
	return context.deviceIdToEdit;
}

export const useDeviceRowIndexToEdit = (): number => {
	const context = useContext(DevicesStateContext);
	if (context === undefined) {
		throw new Error('useDeviceRowIndexToEdit must be used within a DevicesProvider');
	}
	return context.deviceRowIndexToEdit;
}
