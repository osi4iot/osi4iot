import React, { createContext, FC, useContext, useReducer } from 'react';
import { ChildrenProp } from '../../interfaces/interfaces'
import { DevicesContextProps, IDeviceInputData } from './interfaces'
import { initialState, DevicesReducer } from './devicesReducer';

const DevicesStateContext = createContext<DevicesContextProps>(initialState);
const DevicesDispatchContext = createContext<any>({});

export function useDevicesDispatch() {
	const context = React.useContext(DevicesDispatchContext);
	if (context === undefined) {
		throw new Error('useDevicesDispatch must be used within a DevicesProvider');
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

export const useDevicesPreviousOption = (): string => {
	const context = useContext(DevicesStateContext);
	if (context === undefined) {
		throw new Error('useDevicesPreviousOption must be used within a DevicesProvider');
	}
	return context.devicesPreviousOption;
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

export const useDeviceBuildingId = (): number => {
	const context = useContext(DevicesStateContext);
	if (context === undefined) {
		throw new Error('useDeviceBuildingId must be used within a DevicesProvider');
	}
	return context.deviceBuildingId;
}

export const useDeviceGroupId = (): number => {
	const context = useContext(DevicesStateContext);
	if (context === undefined) {
		throw new Error('useDeviceGroupId must be used within a DevicesProvider');
	}
	return context.deviceGroupId;
}

export const useDeviceInputData = (): IDeviceInputData => {
	const context = useContext(DevicesStateContext);
	if (context === undefined) {
		throw new Error('useDeviceInputData must be used within a DevicesProvider');
	}
	return context.deviceInputFormData;
}


