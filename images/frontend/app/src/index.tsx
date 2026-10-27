import { createRoot } from 'react-dom/client';
import { StyleSheetManager } from 'styled-components';
import { shouldForwardProp } from './styledComponentsConfig';
import './index.css';
import './normalize.css';
import App from './App';
import { ModalProvider } from "react-modal-hook";
import Modal from "react-modal";

Modal.setAppElement("#root");

// Nota: en React 18+ <React.StrictMode> monta, desmonta y vuelve a montar cada componente en desarrollo
// (los useEffect se ejecutan dos veces). React 17 no lo hacía, y varios efectos de la app (conexiones
// MQTT/NATS, web workers, URL.revokeObjectURL del modelo glTF...) no están preparados para ello.
// Se omite StrictMode para mantener el mismo comportamiento en desarrollo; se puede reactivar
// cuando esos efectos sean idempotentes.
const container = document.getElementById('root') as HTMLElement;
createRoot(container).render(
  <StyleSheetManager shouldForwardProp={shouldForwardProp}>
    <ModalProvider>
      <App />
    </ModalProvider>
  </StyleSheetManager>
);
