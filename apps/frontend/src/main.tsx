import { StrictMode } from 'react';
import * as ReactDOM from 'react-dom/client';
// Token layer first — the single source of theme values.
import '@task-manager-v2/ui-kit/tokens.css';
import './styles.css';
import { configureMain } from '@task-manager-v2/api';
import App from './app/app';
import { getAccessToken } from './app/auth';
import { startRealtime } from './app/socket';

// The generated main-service client: VITE_API_URL is its origin, empty for this one
configureMain({ baseUrl: import.meta.env.VITE_API_URL ?? '', getAccessToken: () => getAccessToken() });
startRealtime();

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);

root.render(
  <StrictMode>
    <App />
  </StrictMode>,
);
