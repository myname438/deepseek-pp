import { useEffect, useState } from 'react';
import {
  DEFAULT_DEVELOPER_SETTINGS,
  normalizeDeveloperSettings,
  type DeveloperSettings,
} from '../../../core/developer/settings';
import PageIntro from '../components/PageIntro';
import { useI18n } from '../i18n';

type RunState = 'idle' | 'running' | 'done' | 'error';

export default function DeveloperPage() {
  const { t } = useI18n();
  const [settings, setSettings] = useState<DeveloperSettings>(DEFAULT_DEVELOPER_SETTINGS);
  const [prompt, setPrompt] = useState('');
  const [state, setState] = useState<RunState>('idle');
  const [output, setOutput] = useState('');
  const [requestMeta, setRequestMeta] = useState('');

  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'GET_DEVELOPER_SETTINGS' })
      .then((result) => setSettings(normalizeDeveloperSettings(result)))
      .catch(() => setSettings(DEFAULT_DEVELOPER_SETTINGS));
    const handler = (message: { type?: string; settings?: DeveloperSettings }) => {
      if (message.type === 'DEVELOPER_SETTINGS_UPDATED') {
        setSettings(normalizeDeveloperSettings(message.settings));
      }
    };
    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, []);

  const run = async () => {
    if (!prompt.trim()) return;
    setState('running');
    setOutput('');
    setRequestMeta('');
    try {
      const result = await chrome.runtime.sendMessage({
        type: 'RUN_DEEPSEEK_API_PLAYGROUND',
        payload: { prompt },
      });
      if (!result?.ok) throw new Error(result?.error || t('sidepanel.developerPage.runFailed'));
      setOutput(result.output || '');
      setRequestMeta(`${result.request.model} · ${result.request.thinking}`);
      setState('done');
    } catch (error) {
      setOutput(error instanceof Error ? error.message : String(error));
      setState('error');
    }
  };

  if (!settings.developerMode) {
    return (
      <div className="p-4">
        <div className="ds-surface-panel rounded-xl p-4 text-xs leading-relaxed" style={{ color: 'var(--ds-text-secondary)' }}>
          {t('sidepanel.developerPage.disabled')}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <PageIntro
        title={t('sidepanel.developerPage.title')}
        description={t('sidepanel.developerPage.description')}
      />

      <div className="ds-surface-panel rounded-xl p-4 space-y-3">
        {!settings.apiPlaygroundEnabled && (
          <div className="text-xs rounded-lg px-3 py-2" style={{ color: 'var(--ds-danger)', background: 'var(--ds-danger-bg)' }}>
            {t('sidepanel.developerPage.playgroundDisabled')}
          </div>
        )}
        <textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          rows={6}
          className="w-full px-3 py-2 text-xs rounded-lg border outline-none resize-none"
          style={{ background: 'var(--ds-bg)', borderColor: 'var(--ds-border)', color: 'var(--ds-text)' }}
          placeholder={t('sidepanel.developerPage.promptPlaceholder')}
        />
        <button
          type="button"
          disabled={!settings.apiPlaygroundEnabled || state === 'running' || !prompt.trim()}
          onClick={run}
          className="ds-btn-primary w-full py-2.5 text-xs font-medium text-white rounded-lg disabled:opacity-40"
        >
          {state === 'running' ? t('sidepanel.developerPage.running') : t('sidepanel.developerPage.run')}
        </button>
      </div>

      {(output || requestMeta) && (
        <div className="ds-surface-panel rounded-xl p-4 space-y-2">
          {requestMeta && (
            <div className="text-[11px]" style={{ color: 'var(--ds-text-tertiary)' }}>{requestMeta}</div>
          )}
          <pre className="text-xs whitespace-pre-wrap break-words" style={{ color: state === 'error' ? 'var(--ds-danger)' : 'var(--ds-text)' }}>
            {output}
          </pre>
        </div>
      )}
    </div>
  );
}
