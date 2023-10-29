import React from "react";
import "./App.css";
import AppRouter from "./routers/AppRouter";
import { AuthProvider } from "./contexts/authContext";
import { PlatformAssitantProvider } from "./contexts/platformAssistantContext"

declare global {
	interface Window {
		_env_: any;
	}
}

function App() {
	return (
		<AuthProvider>
			<PlatformAssitantProvider>
				<AppRouter />
			</PlatformAssitantProvider>
		</AuthProvider>
	);
}

export default App;