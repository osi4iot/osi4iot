import Paho from "paho-mqtt";

export interface IMqttClientOptions {
  clientId: string;
  port: number;
  username: string;
  accessToken: string;
  keepalive: number;
}

export interface ConnectorProps {
  hostname: string;
  options?: IMqttClientOptions;
  children: React.ReactNode;
}

export interface IMqttContext {
  connectionStatus: string | Error;
  client?: Paho.Client | null;
}

export interface IMessageStructure {
  [key: string]: string;
}

export interface IMessage {
  topic: string;
  message?: string | IMessageStructure;
}


export type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;