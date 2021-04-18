import React from "react";
import "./App.css";
import AppRouter from "./routers/AppRouter";
import { AuthProvider } from "./context";

declare global {
	interface Window {
		_env_: any;
	}
}

function App() {
	return (
		<AuthProvider>
			<AppRouter />
		</AuthProvider>
	);
}

export default App;
