import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ToastProvider } from './components/ui';
import { LibraryProvider } from './songs/library';
import { loadTheme } from './themes';
import './styles/app.css';
import './styles/songs.css';
import './styles/neck.css';
import './styles/drums.css';
import './styles/tuner.css';

document.documentElement.dataset.theme = loadTheme();

createRoot(document.getElementById(`root`)!).render(
  <StrictMode>
    <ToastProvider>
      <LibraryProvider>
        <App />
      </LibraryProvider>
    </ToastProvider>
  </StrictMode>,
);
