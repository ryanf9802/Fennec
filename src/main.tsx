import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { App } from './app/App';
import { FennecProvider } from './app/FennecContext';
import { queryClient } from './data/historyQueries';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <FennecProvider>
          <App />
        </FennecProvider>
      </QueryClientProvider>
    </BrowserRouter>
  </StrictMode>,
);
