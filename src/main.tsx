import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './app/App';
import { FennecProvider } from './app/FennecContext';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <FennecProvider>
        <App />
      </FennecProvider>
    </BrowserRouter>
  </StrictMode>,
);
