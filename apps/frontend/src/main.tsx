import { StrictMode } from 'react';
import * as ReactDOM from 'react-dom/client';
// Token layer first — the single source of theme values.
import '@task-manager-v2/ui-kit/tokens.css';
import './styles.css';
import App from './app/app';

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);

root.render(
  <StrictMode>
    <App />
  </StrictMode>,
);
