import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import './index.css';
import AppRouter from './AppRouter';
import { CrmAuthProvider } from './auth/CrmAuthContext';
import { queryClient } from './api/queryClient';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <CrmAuthProvider>
          <AppRouter />
        </CrmAuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
