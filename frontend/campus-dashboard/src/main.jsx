import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { UserProvider } from './context/UserContext.jsx';
import { installApiFetch } from './lib/api';
import { initPushNotifications } from './lib/firebase';
import './index.css';

installApiFetch();

// Best-effort FCM setup (no-op when VITE_FIREBASE_* is not configured).
initPushNotifications();

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <UserProvider>
        <App />
      </UserProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
