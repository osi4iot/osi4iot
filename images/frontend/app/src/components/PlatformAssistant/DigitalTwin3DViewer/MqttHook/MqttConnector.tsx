import React, { useEffect, useState, useMemo, useRef } from 'react';
import Paho, { MQTTError } from "paho-mqtt";
import MqttContext from './MqttContext';
import { ConnectorProps, IMqttContext } from './interfaces';

const MqttConnector = ({
    children,
    hostname,
    options = {
        keepalive: 0,
        clientId: '',
        port: 9001,
        username: '',
        accessToken: ''
    }
}: ConnectorProps) => {
    // Using a ref rather than relying on state because it is synchronous
    const clientValid = useRef(false);
    const [connectionStatus, setStatus] = useState<string | Error>('Offline');
    const [client, setClient] = useState<Paho.Client | null>(null);

    useEffect(() => {
        if (!client && !clientValid.current) {
            // This synchronously ensures we won't enter this block again
            // before the client is asynchronously set
            clientValid.current = true;

            setStatus('Connecting');
            console.log(`Attempting to connect to ${hostname}`);

            const port = 9001;
            const clientId = "clientId_" + Math.floor(Math.random() * 1000);
            const mqttClient = new Paho.Client(hostname, port, clientId);


            const onConnect = () => {
                console.log("Client connected")
                setStatus('Connected');
                // For some reason setting the client as soon as we get it from connect breaks things
                setClient(mqttClient);
            }

            const onConnectionLost = (error: MQTTError) => {
                if (error.errorCode !== 0) {
                    setStatus('Offline');
                }
            }

            const onFailure = (error: any) => {
                console.log(`Connection error: ${error}`);
                setStatus(error.message);
            }


            // // connect the client
            mqttClient.connect({
                useSSL: true,
                timeout: 3,
                onSuccess: onConnect,
                onFailure: onFailure,
                userName: options.username,
                password: options.accessToken,
            });

            mqttClient.onConnectionLost = onConnectionLost;

        }
    }, [client, clientValid, hostname, options]);

    // Only do this when the component unmounts
    useEffect(
        () => () => {
            if (client) {
                console.log('Closing mqtt client');
                client.disconnect();
                setClient(null);
                clientValid.current = false;
            }
        },
        [client, clientValid],
    );

    // This is to satisfy
    // https://github.com/jsx-eslint/eslint-plugin-react/blob/master/docs/rules/jsx-no-constructed-context-values.md
    const value: IMqttContext = useMemo<IMqttContext>(
        () => ({
            connectionStatus,
            client
        }),
        [connectionStatus, client],
    );

    return <MqttContext.Provider value={value}>{children}</MqttContext.Provider>;
}

export default MqttConnector;
