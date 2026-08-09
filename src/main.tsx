import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { App } from './app/App';
import { FennecProvider } from './app/FennecContext';
import { queryClient } from './data/historyQueries';
import {
  LocalAccessProvider,
  useLocalAccess,
} from './platform/LocalAccessContext';
import './styles.css';

// eslint-disable-next-line react-refresh/only-export-components
function FennecRuntime() {
  const access = useLocalAccess();
  return (
    <FennecProvider feedEnabled={access.satisfied}>
      <App />
    </FennecProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LocalAccessProvider>
      <BrowserRouter>
        <QueryClientProvider client={queryClient}>
          <FennecRuntime />
        </QueryClientProvider>
      </BrowserRouter>
    </LocalAccessProvider>
  </StrictMode>,
);
