export interface INatsClientOptions {
  clientId: string;
  port: number;
  username: string;
  accessToken: string;
}
 
export interface ConnectorProps {
  hostname: string;
  options?: INatsClientOptions;
  children: React.ReactNode;
}
 
export interface IMessageStructure {
  [key: string]: string;
}
 
export interface IMessage {
  topic: string;
  message?: string | IMessageStructure;
}
 
export type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;