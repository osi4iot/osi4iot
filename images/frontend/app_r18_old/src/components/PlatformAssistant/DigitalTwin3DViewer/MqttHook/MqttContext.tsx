import { createContext } from 'react';

import { IMqttContext } from './interfaces';

export default createContext<IMqttContext>({} as IMqttContext);
