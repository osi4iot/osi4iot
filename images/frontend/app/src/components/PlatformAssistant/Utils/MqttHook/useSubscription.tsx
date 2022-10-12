import { useContext, useEffect, useCallback, useState } from 'react';
import { SubscribeOptions } from "paho-mqtt";
import MqttContext from './MqttContext';
import { IMqttContext as Context, IUseSubscription, IMessage } from './types';
import matches from './matches';

const useSubscription = (
    topic: string | string[],
    options: SubscribeOptions = {} as SubscribeOptions,
): IUseSubscription => {
    const { client, connectionStatus } = useContext<Context>(MqttContext);
    
    const [message, setMessage] = useState<IMessage | undefined>(undefined);

    useEffect(() => {
        if (client?.isConnected) {
            console.log("Paso por useeffect subscribe")
            // subscribe();
            if (typeof topic === "string") {
                client?.subscribe(topic, options);
            } else {
                for (const topic_i of topic as string[]) {
                    client?.subscribe(topic_i, options);
                }
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [client]);

    useEffect(() => {
        if (client?.isConnected) {
            console.log("Paso por useeffect client.onMessageArrived")
            client.onMessageArrived = (message: any) => {
                if ([topic].flat().some(rTopic => matches(rTopic, message.destinationName))) {
                    console.log("receivedTopic=", message.destinationName)
                    setMessage({
                        topic: message.destinationName,
                        message: message.payloadString.toString(),
                    });
                }
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [client]);

    return {
        client,
        topic,
        message,
        connectionStatus,
    };
}

export default useSubscription;