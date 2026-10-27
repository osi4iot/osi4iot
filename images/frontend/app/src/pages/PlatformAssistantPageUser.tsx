import { FC } from "react";
import PlatformAssistantLayout from "../components/Layout/PlatformAssistantLayout";
import UserOptions from "../components/PlatformAssistant/UserOptions/UserOptions";
import { LayerScopeProvider } from "../state";

const PlatformAssistantPageUser: FC<{}> = () => (
    <PlatformAssistantLayout layer="user">
        <LayerScopeProvider scope="user">
            <UserOptions />
        </LayerScopeProvider>
    </PlatformAssistantLayout>
);

export default PlatformAssistantPageUser;
