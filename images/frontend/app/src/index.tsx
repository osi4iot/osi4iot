import React from 'react';
import ReactDOM from 'react-dom';
import './index.css';
import './normalize.css';
import App from './App';
import { ModalProvider } from "react-modal-hook";
import Modal from "react-modal";

Modal.setAppElement("#root");


ReactDOM.render(
  <React.StrictMode>
    <ModalProvider>
      <App />
    </ModalProvider>
  </React.StrictMode>,
  document.getElementById('root')
);

