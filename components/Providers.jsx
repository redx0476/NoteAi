'use client';

import { useEffect } from 'react';
import { ToastProvider } from './Toast';
import { applyTheme, getTheme } from '@/lib/client/api';

export default function Providers({ children }) {
  useEffect(() => {
    applyTheme(getTheme());
  }, []);

  return <ToastProvider>{children}</ToastProvider>;
}
