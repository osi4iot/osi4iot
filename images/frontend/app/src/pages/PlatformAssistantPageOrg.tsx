import { FC } from "react";
import PlatformAssistantLayout from "../components/Layout/PlatformAssistantLayout";
import OrganizationAdminOptions from "../components/PlatformAssistant/OrganizationAdminOptions/OrganizationAdminOptions";
import { LayerScopeProvider } from "../state";

const PlatformAssistantPageOrg: FC<{}> = () => (
    <PlatformAssistantLayout layer="org">
        <LayerScopeProvider scope="org">
            <OrganizationAdminOptions />
        </LayerScopeProvider>
    </PlatformAssistantLayout>
);

export default PlatformAssistantPageOrg;
