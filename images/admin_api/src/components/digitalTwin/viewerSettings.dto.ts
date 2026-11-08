import { IsObject } from "class-validator";

// The digital twin's own viewer settings, e.g. {lighting: {lightingPreset, environment, exposure...}}: saved
// from the 3D viewer by a group administrator; the frontend checks each key when it reads them.
class UpdateViewerSettingsDto {
	@IsObject()
	public viewerSettings: Record<string, unknown>;
}

export default UpdateViewerSettingsDto;
