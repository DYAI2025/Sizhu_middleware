import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import AuthCallbackView from './components/auth/AuthCallbackView';
import './index.css';

// Minimal path routing for the dedicated auth screens. The rest of the console
// is a single-page app gated by ProtectedRoute.
function Root() {
  const path = window.location.pathname;
  if (path === '/auth/callback') {
    return <AuthCallbackView />;
  }
  return <App />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
