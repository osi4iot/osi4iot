import { ComponentProps, FC } from "react";
import { Oval } from "react-loader-spinner";

// Adaptador para react-loader-spinner v8: los loaders ya no aceptan `className`
// (usan `wrapperClass`), así que se mapea para que `styled(OvalSpinner)` siga funcionando.
type OvalSpinnerProps = ComponentProps<typeof Oval> & { className?: string };

const OvalSpinner: FC<OvalSpinnerProps> = ({ className, wrapperClass, ...props }) => (
    <Oval wrapperClass={[className, wrapperClass].filter(Boolean).join(" ") || undefined} {...props} />
);

export default OvalSpinner;
