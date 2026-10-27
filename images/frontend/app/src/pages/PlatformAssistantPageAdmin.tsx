import { FC } from "react";
import PlatformAssistantLayout from "../components/Layout/PlatformAssistantLayout";
import PlatformAdminOptions from "../components/PlatformAssistant/PlatformAdminOptions/PlatformAdminOptions";
import { LayerScopeProvider } from "../state";

const PlatformAssistantPageAdmin: FC<{}> = () => (
    <PlatformAssistantLayout layer="admin">
        <LayerScopeProvider scope="admin">
            <PlatformAdminOptions />
        </LayerScopeProvider>
    </PlatformAssistantLayout>
);

export default PlatformAssistantPageAdmin;
