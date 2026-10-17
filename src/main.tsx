import React from 'react';
import { createRoot } from 'react-dom/client';
import CloudAuth from './CloudAuth';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <CloudAuth />
  </React.StrictMode>
);
