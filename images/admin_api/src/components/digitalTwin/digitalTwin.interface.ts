export default interface IDigitalTwin {
	id?: number;
	orgId: number;
	groupId: number;
	assetId: number;
	scope: string;
	digitalTwinUid: string;
	description: string;
	type: string;
	dashboardId: number;
	maxNumResFemFiles: number;
	chatAssistantEnabled: boolean;
	chatAssistantLanguage: string;
	// bilingual chat: the second language ("none") and the language of the spoken answers
	// ("question" | "primary" | "secondary")
	chatAssistantSecondLanguage?: string;
	chatAssistantVoiceLanguage?: string;
	// chat channels: voice messages from the "Mobile sensors" page and a Telegram chat ("": none)
	chatMobileVoiceEnabled?: boolean;
	chatTelegramChatId?: string;
	digitalTwinSimulationFormat: string;
	// the twin's own viewer settings ({lighting: {...}}), saved from the 3D viewer
	viewerSettings?: Record<string, unknown>;
	// The file the simulation format was loaded from ("-": none)
	digitalTwinSimulationFormatFileName?: string;
	digitalTwinSimulationFormatLastModifDate?: string;
	dashboardUrl: string;
	sensorsRef: string[];
	pipelineFileName: string;
	pipelineFileLastModifDate: string;
	pipelineFileData: string;
	pipelineRequiresGpu: boolean;
	// File names of the group's knowledge base its AI agents may read.
	knowledgeDocuments?: string[];
	created?: string;
	updated?: string;
}
