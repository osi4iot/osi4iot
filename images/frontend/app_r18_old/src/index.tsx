import { createRoot } from 'react-dom/client';
import './index.css';
import './normalize.css';
import App from './App';
import { ModalProvider } from "react-modal-hook";
import Modal from "react-modal";

Modal.setAppElement("#root");

const container = document.getElementById('root');
const root = createRoot(container!); // createRoot(container!) if you use TypeScript
root.render(
    <ModalProvider>
      <App />
    </ModalProvider>
);


