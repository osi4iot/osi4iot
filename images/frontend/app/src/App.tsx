import "./App.css";
import AppRouter from "./routers/AppRouter";
import { AuthProvider } from "./contexts/authContext";
import { StateProvider } from "./state";

declare global {
	interface Window {
		_env_: any;
		crossOriginIsolated: boolean;
	}
}

function App() {
	return (
		<AuthProvider>
			<StateProvider>
				<AppRouter />
			</StateProvider>
		</AuthProvider>
	);
}

export default App;