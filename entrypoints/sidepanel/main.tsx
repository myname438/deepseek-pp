import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './style.css';

type DeepSeekTheme = 'light' | 'dark';

applyStoredTheme();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

function applyTheme(theme: DeepSeekTheme | null | undefined) {
  const root = document.documentElement;
  if (theme === 'light' || theme === 'dark') {
    root.setAttribute('data-theme', theme);
    root.style.colorScheme = theme;
    return;
  }
  root.removeAttribute('data-theme');
  root.style.removeProperty('color-scheme');
}

function applyStoredTheme() {
  if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) return;

  chrome.runtime.sendMessage({ type: 'GET_DEEPSEEK_THEME' })
    .then((theme: DeepSeekTheme | null) => applyTheme(theme))
    .catch(() => applyTheme(null));

  chrome.runtime.onMessage.addListener((message: { type?: string; theme?: DeepSeekTheme }) => {
    if (message.type === 'THEME_UPDATED') {
      applyTheme(message.theme);
    }
  });
}
