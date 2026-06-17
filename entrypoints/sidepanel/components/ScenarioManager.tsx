import { useState, useEffect } from 'react';
import type { ScenarioConfig } from '../../../core/types';
import {
  getAllScenarios,
  saveScenario,
  deleteScenario,
  addCustomScenario,
} from '../../../core/scenario/store';
import { useI18n } from '../i18n';

export default function ScenarioManager() {
  const { t } = useI18n();
  const [scenarios, setScenarios] = useState<ScenarioConfig[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTemplate, setEditTemplate] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newTemplate, setNewTemplate] = useState('');

  useEffect(() => {
    getAllScenarios().then(setScenarios);
  }, []);

  const refresh = async () => {
    const updated = await getAllScenarios();
    setScenarios(updated);
    chrome.runtime.sendMessage({ type: 'SCENARIOS_UPDATED' }).catch(() => {});
  };

  const toggleEnabled = async (scenario: ScenarioConfig) => {
    await saveScenario({ ...scenario, enabled: !scenario.enabled });
    await refresh();
  };

  const startEdit = (scenario: ScenarioConfig) => {
    setEditingId(scenario.id);
    setEditTemplate(scenario.template);
  };

  const saveTemplate = async (scenario: ScenarioConfig) => {
    await saveScenario({ ...scenario, template: editTemplate });
    setEditingId(null);
    await refresh();
  };

  const handleAdd = async () => {
    if (!newLabel.trim() || !newTemplate.trim()) return;
    await addCustomScenario(newLabel.trim(), newTemplate.trim());
    setNewLabel('');
    setNewTemplate('');
    await refresh();
  };

  const handleDelete = async (id: string) => {
    await deleteScenario(id);
    await refresh();
  };

  return (
    <section className="space-y-3">
      <div className="space-y-0.5">
        <h2 className="ds-settings-section-title">
          {t('sidepanel.scenario.title')}
        </h2>
        <p className="ds-settings-section-description">
          {t('sidepanel.scenario.description')}
        </p>
      </div>
      <div className="ds-surface-panel rounded-xl p-4 space-y-1">
      {scenarios.filter((s) => s.builtIn).map((s) => (
        <div key={s.id} className="flex items-center gap-2 py-1.5">
          <label className="switch">
            <input type="checkbox" checked={s.enabled} onChange={() => toggleEnabled(s)} />
            <span className="slider" />
          </label>
          <span className="text-sm flex-1" style={{ color: 'var(--ds-text)' }}>{s.label}</span>
          {editingId === s.id ? (
            <div className="flex gap-1">
              <input
                value={editTemplate}
                onChange={(e) => setEditTemplate(e.target.value)}
                className="text-xs px-2 py-1 rounded w-48"
                style={{ background: 'var(--ds-surface)', color: 'var(--ds-text)', border: '1px solid var(--ds-border)' }}
              />
              <button onClick={() => saveTemplate(s)} className="text-xs px-2 py-1 rounded" style={{ background: 'var(--ds-accent)', color: '#fff' }}>{t('common.save')}</button>
            </div>
          ) : (
            <button onClick={() => startEdit(s)} className="text-xs" style={{ color: 'var(--ds-text-tertiary)' }}>{t('common.edit')}</button>
          )}
        </div>
      ))}

      <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--ds-border)' }}>
        <span className="text-xs font-medium" style={{ color: 'var(--ds-text-secondary)' }}>{t('sidepanel.scenario.customTitle')}</span>
        {scenarios.filter((s) => !s.builtIn).map((s) => (
          <div key={s.id} className="flex items-center gap-2 py-1.5">
            <label className="switch">
              <input type="checkbox" checked={s.enabled} onChange={() => toggleEnabled(s)} />
              <span className="slider" />
            </label>
            <span className="text-sm flex-1" style={{ color: 'var(--ds-text)' }}>{s.label}</span>
            <button onClick={() => handleDelete(s.id)} className="text-xs text-red-400">{t('common.delete')}</button>
          </div>
        ))}
        <div className="flex gap-1 mt-2">
          <input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder={t('sidepanel.scenario.namePlaceholder')}
            className="text-xs px-2 py-1 rounded flex-1"
            style={{ background: 'var(--ds-surface)', color: 'var(--ds-text)', border: '1px solid var(--ds-border)' }}
          />
          <input
            value={newTemplate}
            onChange={(e) => setNewTemplate(e.target.value)}
            placeholder={t('sidepanel.scenario.templatePlaceholder')}
            className="text-xs px-2 py-1 rounded flex-[2]"
            style={{ background: 'var(--ds-surface)', color: 'var(--ds-text)', border: '1px solid var(--ds-border)' }}
          />
          <button onClick={handleAdd} className="text-xs px-2 py-1 rounded" style={{ background: 'var(--ds-accent)', color: '#fff' }}>{t('common.add')}</button>
        </div>
      </div>
      </div>
    </section>
  );
}
