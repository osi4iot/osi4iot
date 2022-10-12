import { useContext } from 'react';

import MqttContext from './MqttContext';
import { IMqttContext as Context } from './types';

export default function useMqttState() {
  const { connectionStatus, client, parserMethod } = useContext<Context>(
    MqttContext,
  );

  return {
    connectionStatus,
    client,
    parserMethod,
  };
}
