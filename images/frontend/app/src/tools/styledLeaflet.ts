import { ComponentType } from 'react';

export const asStylable = <T,>(component: T) => component as unknown as ComponentType<any>;