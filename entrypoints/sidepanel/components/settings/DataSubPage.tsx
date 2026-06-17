import { SVG_PATHS } from '../../constants';
import { useI18n } from '../../i18n';
import { SettingsSection, StatusMessage, TextField, useBanner, useConfirm } from './primitives';
import type { SettingsState } from './useSettingsState';
import type { SyncCounts } from '../../../../core/types';

export default function DataSubPage({ state }: { state: SettingsState }) {
  const { t, locale } = useI18n();
  const { confirm, node: confirmNode } = useConfirm();
  const banner = useBanner();

  const formatTime = (ts: number | null) => {
    if (!ts) return t('sidepanel.settings.neverSynced');
    return new Date(ts).toLocaleString(locale, {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatSyncCounts = (counts?: SyncCounts) => {
    if (!counts) return '';
    return t('sidepanel.settings.syncCounts', {
      memories: counts.memories,
      skills: counts.skills,
      presets: counts.presets,
      projects: counts.projects,
      projectConversations: counts.projectConversations,
      savedItems: counts.savedItems,
    });
  };

  const onTest = () =>
    state.handleTestSync({
      permissionDenied: t('sidepanel.settings.webDavPermissionDenied'),
      operationFailed: t('sidepanel.settings.operationFailed'),
      success: t('sidepanel.settings.connectionSuccess'),
      failed: t('sidepanel.settings.connectionFailed'),
    });

  const onUpload = async () => {
    const ok = await confirm({
      title: t('sidepanel.settings.uploadLocal'),
      message: t('sidepanel.settings.uploadConfirm'),
      confirmLabel: t('sidepanel.settings.uploadLocal'),
      cancelLabel: t('common.cancel'),
    });
    if (!ok) return;
    state.handleUploadSync({
      permissionDenied: t('sidepanel.settings.webDavPermissionDenied'),
      operationFailed: t('sidepanel.settings.operationFailed'),
      failed: t('sidepanel.settings.uploadFailed'),
      success: (counts) => t('sidepanel.settings.uploadSuccess', { counts: formatSyncCounts(counts) }),
    });
  };

  const onDownload = async () => {
    const ok = await confirm({
      title: t('sidepanel.settings.downloadRemote'),
      message: t('sidepanel.settings.downloadConfirm'),
      confirmLabel: t('sidepanel.settings.downloadRemote'),
      cancelLabel: t('common.cancel'),
    });
    if (!ok) return;
    state.handleDownloadSync({
      permissionDenied: t('sidepanel.settings.webDavPermissionDenied'),
      operationFailed: t('sidepanel.settings.operationFailed'),
      failed: t('sidepanel.settings.downloadFailed'),
      success: (counts) => t('sidepanel.settings.downloadSuccess', { counts: formatSyncCounts(counts) }),
    });
  };

  const onClearAll = async () => {
    const ok = await confirm({
      title: t('sidepanel.settings.clearAllMemories'),
      message: t('sidepanel.settings.clearAllConfirm'),
      confirmLabel: t('sidepanel.settings.clearAllMemories'),
      cancelLabel: t('common.cancel'),
    });
    if (!ok) return;
    await state.handleClearAllMemories();
  };

  return (
    <div className="space-y-5">
      {confirmNode}
      {banner.node}

      <SettingsSection
        title={t('sidepanel.settings.cloudSyncSection')}
        description={t('sidepanel.settings.dataDescription')}
      >
        <TextField
          label={t('sidepanel.settings.webDavUrl')}
          type="url"
          value={state.syncConfig.url}
          placeholder="https://dav.example.com/dav/"
          onChange={(v) => state.updateSyncField('url', v)}
        />

        <div className="grid grid-cols-2 gap-2">
          <TextField
            label={t('sidepanel.settings.username')}
            value={state.syncConfig.username}
            onChange={(v) => state.updateSyncField('username', v)}
          />
          <TextField
            label={t('sidepanel.settings.password')}
            type="password"
            value={state.syncConfig.password}
            onChange={(v) => state.updateSyncField('password', v)}
          />
        </div>

        <TextField
          label={t('sidepanel.settings.remotePath')}
          value={state.syncConfig.remotePath}
          onChange={(v) => state.updateSyncField('remotePath', v)}
        />
      </SettingsSection>

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={onTest}
          disabled={!state.syncConfig.url || state.syncBusy}
          className="ds-btn-secondary col-span-2 py-2.5 text-xs font-medium rounded-lg transition-all duration-150 flex items-center justify-center gap-1.5 disabled:opacity-40"
        >
          {state.syncStatus === 'testing' ? (
            <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
          ) : (
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          )}
          {t('sidepanel.settings.testConnection')}
        </button>
        <button
          onClick={onUpload}
          disabled={!state.syncConfig.url || state.syncBusy}
          className="ds-btn-secondary py-2.5 text-xs font-medium rounded-lg transition-all duration-150 flex items-center justify-center gap-1.5 disabled:opacity-40"
          style={
            state.syncConfig.url && !state.syncBusy
              ? { background: 'var(--ds-blue)', color: 'var(--ds-text-on-primary)', borderColor: 'var(--ds-blue)' }
              : undefined
          }
        >
          {state.syncStatus === 'uploading' ? (
            <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
          ) : (
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d={SVG_PATHS.upload} />
            </svg>
          )}
          {t('sidepanel.settings.uploadLocal')}
        </button>
        <button
          onClick={onDownload}
          disabled={!state.syncConfig.url || state.syncBusy}
          className="ds-btn-secondary py-2.5 text-xs font-medium rounded-lg transition-all duration-150 flex items-center justify-center gap-1.5 disabled:opacity-40"
        >
          {state.syncStatus === 'downloading' ? (
            <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
          ) : (
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d={SVG_PATHS.download} />
            </svg>
          )}
          {t('sidepanel.settings.downloadRemote')}
        </button>
      </div>

      {state.syncMessage && (
        <StatusMessage tone={state.syncStatus === 'error' ? 'error' : 'success'}>
          {state.syncMessage}
        </StatusMessage>
      )}

      <div className="text-[11px] text-center" style={{ color: 'var(--ds-text-tertiary)' }}>
        {t('sidepanel.settings.lastSync', { time: formatTime(state.syncConfig.lastSyncAt) })}
      </div>

      <SettingsSection
        title={t('sidepanel.settings.dataSection')}
        description={t('sidepanel.settings.dataDescription')}
      >
        <div className="flex justify-between items-center text-sm">
          <span style={{ color: 'var(--ds-text-secondary)' }}>{t('sidepanel.settings.memoryTotal')}</span>
          <span className="text-lg font-semibold" style={{ color: 'var(--ds-blue)' }}>
            {state.memoryCount}
          </span>
        </div>

        <div className="flex gap-2">
          <button
            onClick={state.handleExport}
            className="ds-btn-secondary flex-1 py-2.5 text-xs font-medium rounded-lg transition-all duration-150 flex items-center justify-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d={SVG_PATHS.download} />
            </svg>
            {t('sidepanel.settings.exportMemories')}
          </button>
          <button
            onClick={() => state.handleImport(
              {
                arrayError: t('sidepanel.settings.importMemoryArrayError'),
                jsonError: t('sidepanel.settings.jsonFormatError'),
              },
              (result) => {
                if (result.ok) {
                  banner.show('success', t('sidepanel.settings.importSuccess', { count: result.imported ?? 0 }));
                } else {
                  banner.show('error', result.error ?? t('sidepanel.settings.jsonFormatError'));
                }
              },
            )}
            className="ds-btn-secondary flex-1 py-2.5 text-xs font-medium rounded-lg transition-all duration-150 flex items-center justify-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d={SVG_PATHS.upload} />
            </svg>
            {t('sidepanel.settings.importMemories')}
          </button>
        </div>

        <button
          onClick={onClearAll}
          className="ds-btn-danger w-full py-2.5 text-xs font-medium rounded-lg transition-all duration-150"
        >
          {t('sidepanel.settings.clearAllMemories')}
        </button>
      </SettingsSection>
    </div>
  );
}
