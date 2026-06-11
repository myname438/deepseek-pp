import { lazy, Suspense, useEffect, useState } from 'react';
import type { LocaleMessageKey } from '../../core/i18n';
import { getExtensionVersion } from '../../core/version';
import { getChatEnabled } from '../../core/chat/store';
import { DEFAULT_DEVELOPER_SETTINGS, normalizeDeveloperSettings, type DeveloperSettings } from '../../core/developer/settings';
import { useI18n } from './i18n';
import { setPendingText } from './pending-text';

type Tab = 'chat' | 'library' | 'projects' | 'capabilities' | 'developer' | 'settings';

const LibraryPage = lazy(() => import('./pages/LibraryPage'));
const ProjectsPage = lazy(() => import('./pages/ProjectsPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const CapabilitiesPage = lazy(() => import('./pages/CapabilitiesPage'));
const ChatPage = lazy(() => import('./pages/ChatPage'));
const DeveloperPage = lazy(() => import('./pages/DeveloperPage'));

const TABS: { key: Tab; labelKey: LocaleMessageKey; icon: string }[] = [
  { key: 'chat', labelKey: 'app.tabs.chat', icon: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z' },
  { key: 'library', labelKey: 'app.tabs.library', icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5s3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18s-3.332.477-4.5 1.253' },
  { key: 'projects', labelKey: 'app.tabs.projects', icon: 'M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z' },
  { key: 'capabilities', labelKey: 'app.tabs.capabilities', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
  { key: 'developer', labelKey: 'app.tabs.developer', icon: 'M8 9l3 3-3 3m5 0h3M5 5h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z' },
  { key: 'settings', labelKey: 'app.tabs.settings', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z' },
];

export default function App() {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>('chat');
  const version = getExtensionVersion();
  const [chatEnabled, setChatEnabledState] = useState<boolean | null>(null);
  const [developerSettings, setDeveloperSettings] = useState<DeveloperSettings>(DEFAULT_DEVELOPER_SETTINGS);

  useEffect(() => {
    getChatEnabled().then(setChatEnabledState);
    const handler = (changes: Record<string, chrome.storage.StorageChange>) => {
      if ('deepseek_pp_chat_enabled' in changes) {
        setChatEnabledState(changes.deepseek_pp_chat_enabled.newValue === true);
      }
    };
    chrome.storage.onChanged.addListener(handler);
    return () => chrome.storage.onChanged.removeListener(handler);
  }, []);

  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'GET_DEVELOPER_SETTINGS' })
      .then((result) => setDeveloperSettings(normalizeDeveloperSettings(result)))
      .catch(() => setDeveloperSettings(DEFAULT_DEVELOPER_SETTINGS));
    const handler = (message: { type?: string; settings?: DeveloperSettings }) => {
      if (message.type === 'DEVELOPER_SETTINGS_UPDATED') {
        setDeveloperSettings(normalizeDeveloperSettings(message.settings));
      }
    };
    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, []);

  useEffect(() => {
    if (chatEnabled === false && tab === 'chat') {
      setTab('library');
    }
    if (!developerSettings.developerMode && tab === 'developer') {
      setTab('settings');
    }
  }, [chatEnabled, developerSettings.developerMode, tab]);

  // Read pending text on mount in case the sidepanel opened after the message was sent.
  useEffect(() => {
    chrome.storage.local.get('pendingChatText').then((data) => {
      const text = data.pendingChatText as string | undefined;
      if (text) {
        chrome.storage.local.remove('pendingChatText').catch(() => {});
        setPendingText(text);
        setTab('chat');
      }
    });
  }, []);

  useEffect(() => {
    const handler = (msg: { type: string; text?: string }) => {
      if (msg.type === 'OPEN_CHAT_WITH_TEXT' && typeof msg.text === 'string') {
        chrome.storage.local.remove('pendingChatText').catch(() => {});
        setPendingText(msg.text);
        setTab('chat');
      }
    };
    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, []);

  return (
    <div className="flex flex-col h-screen" style={{ background: 'var(--ds-bg)' }}>
      <header
        className="flex items-center justify-between px-5 py-3.5"
        style={{ borderBottom: '1px solid var(--ds-border)' }}
      >
        <div className="flex items-center gap-2.5">
          <img
            src="/logo.png"
            alt="DeepSeek++"
            className="w-7 h-7 rounded-lg object-cover"
          />
          <h1 className="text-[15px] font-semibold" style={{ color: 'var(--ds-text)' }}>
            DeepSeek++
          </h1>
        </div>
        <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ color: 'var(--ds-text-tertiary)', background: 'var(--ds-surface)' }}>
          {t('app.version', { version })}
        </span>
      </header>

      <nav className="side-tabs" aria-label={t('app.sideNavLabel')}>
        {TABS.filter((tabConfig) =>
          (chatEnabled !== false || tabConfig.key !== 'chat') &&
          (developerSettings.developerMode || tabConfig.key !== 'developer')
        ).map((tabConfig) => {
          const label = t(tabConfig.labelKey);
          return (
            <button
              key={tabConfig.key}
              type="button"
              onClick={() => setTab(tabConfig.key)}
              className={`side-tab${tab === tabConfig.key ? ' side-tab-active' : ''}`}
              aria-current={tab === tabConfig.key ? 'page' : undefined}
              title={label}
            >
              <svg
                className="side-tab-icon"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d={tabConfig.icon} />
              </svg>
              <span className="side-tab-label">{label}</span>
              {tab === tabConfig.key && <span className="side-tab-indicator" />}
            </button>
          );
        })}
      </nav>

      <main className="flex-1 overflow-y-auto">
        <Suspense fallback={<div className="p-4 text-sm" style={{ color: 'var(--ds-text-tertiary)' }}>{t('common.loading')}</div>}>
          {tab === 'chat' && <ChatPage />}
          {tab === 'library' && (
            <LibraryPage
              onInsertPrompt={(text) => {
                setPendingText(text);
                setTab('chat');
              }}
            />
          )}
          {tab === 'projects' && <ProjectsPage />}
          {tab === 'capabilities' && <CapabilitiesPage />}
          {tab === 'developer' && <DeveloperPage />}
          {tab === 'settings' && <SettingsPage />}
        </Suspense>
      </main>
    </div>
  );
}
