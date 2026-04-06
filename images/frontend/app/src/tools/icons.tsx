import { IconType } from "react-icons";
import { ComponentType } from "react";

export const asIcon = (Icon: IconType) =>
    Icon as unknown as ComponentType<{ size?: number; color?: string; style?: React.CSSProperties; className?: string }>;
