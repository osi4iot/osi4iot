import React from 'react';
import './App.css';
import Menu from './components/Menu/Menu';
import RegisterPage from './components/Registration/RegisterPage';
import { isRegistrationRequest } from './tools/tools';

declare global {
  interface Window {
      _env_:any;
  }
}

function App() {
  if (isRegistrationRequest()) {
    return (
      <RegisterPage/>
   );
  } else {
    return (
      <Menu/>
    )
  }
}

export default App;
