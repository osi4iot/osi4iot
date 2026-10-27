import { FC } from "react";
import PlatformAssistantLayout from "../components/Layout/PlatformAssistantLayout";
import GroupAdminOptions from "../components/PlatformAssistant/GroupAdminOptions/GroupAdminOptions";
import { LayerScopeProvider } from "../state";

const PlatformAssistantPageGroup: FC<{}> = () => (
    <PlatformAssistantLayout layer="group">
        <LayerScopeProvider scope="group">
            <GroupAdminOptions />
        </LayerScopeProvider>
    </PlatformAssistantLayout>
);

export default PlatformAssistantPageGroup;
