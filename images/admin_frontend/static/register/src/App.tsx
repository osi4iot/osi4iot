import React from 'react';
import './App.css';
import RegisterPage from './components/RegisterPage';

declare global {
  interface Window {
      _env_:any;
  }
}

function App() {
  return (
    <RegisterPage/>
  );
}

export default App;
