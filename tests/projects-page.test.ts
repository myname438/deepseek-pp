import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ProjectsPage from '../entrypoints/sidepanel/pages/ProjectsPage';
import type { ProjectContext, ProjectContextState } from '../core/project';

const EMPTY_PROJECT_STATE: ProjectContextState = {
  schemaVersion: 1,
  projects: [],
  files: [],
  activeProjectId: null,
  activeFileIds: [],
};

let container: HTMLDivElement;
let root: Root | null;
let runtimeListeners: Array<(message: unknown) => void>;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.append(container);
  root = null;
  runtimeListeners = [];
});

afterEach(() => {
  if (root) {
    act(() => root?.unmount());
  }
  container.remove();
  vi.unstubAllGlobals();
});

describe('ProjectsPage', () => {
  it('renders a newly created project after background storage confirms it', async () => {
    let state = { ...EMPTY_PROJECT_STATE };
    const project = createProject('project-1', 'Alpha');
    const sendMessage = vi.fn(async (message: { type: string; payload?: unknown }) => {
      if (message.type === 'GET_PROJECT_CONTEXT_STATE') return state;
      if (message.type === 'CREATE_PROJECT_CONTEXT') {
        state = {
          ...state,
          projects: [project],
          activeProjectId: project.id,
        };
        return project;
      }
      return { ok: true };
    });

    await renderProjectsPage(sendMessage);
    await enterProjectName('Alpha');
    await clickCreateProject();

    expect(container.textContent).toContain('Alpha');
    expect(container.textContent).toContain('当前项目：Alpha');
    expect(sendMessage).toHaveBeenCalledWith({
      type: 'CREATE_PROJECT_CONTEXT',
      payload: { name: 'Alpha', instructions: '' },
    });
  });

  it('surfaces unavailable project backend instead of clearing the form silently', async () => {
    const sendMessage = vi.fn(async (message: { type: string }) => {
      if (message.type === 'GET_PROJECT_CONTEXT_STATE') return EMPTY_PROJECT_STATE;
      if (message.type === 'CREATE_PROJECT_CONTEXT') return null;
      return { ok: true };
    });

    await renderProjectsPage(sendMessage);
    await enterProjectName('Alpha');
    await clickCreateProject();

    expect(projectNameInput().value).toBe('Alpha');
    expect(container.textContent).toContain('项目后端不可用');
    expect(container.textContent).not.toContain('当前项目：Alpha');
  });

  it('passes the optional GitHub token only when importing a repository', async () => {
    const project = createProject('project-1', 'Alpha');
    const state: ProjectContextState = {
      ...EMPTY_PROJECT_STATE,
      projects: [project],
      activeProjectId: project.id,
    };
    const sendMessage = vi.fn(async (message: { type: string; payload?: unknown }) => {
      if (message.type === 'GET_PROJECT_CONTEXT_STATE') return state;
      if (message.type === 'IMPORT_GITHUB_PROJECT_CONTEXT') return { ok: true, files: [], warnings: [] };
      return { ok: true };
    });

    await renderProjectsPage(sendMessage);
    await enterInput('https://github.com/owner/repo', 'https://github.com/owner/repo');
    await enterInput('GitHub Token（可选，不会保存）', '  github_pat_test  ');
    await clickButton('导入 GitHub 仓库');

    expect(sendMessage).toHaveBeenCalledWith({
      type: 'IMPORT_GITHUB_PROJECT_CONTEXT',
      payload: {
        projectId: 'project-1',
        url: 'https://github.com/owner/repo',
        token: 'github_pat_test',
      },
    });
  });
});

async function renderProjectsPage(sendMessage: ReturnType<typeof vi.fn>) {
  vi.stubGlobal('chrome', {
    runtime: {
      sendMessage,
      onMessage: {
        addListener: vi.fn((listener: (message: unknown) => void) => {
          runtimeListeners.push(listener);
        }),
        removeListener: vi.fn((listener: (message: unknown) => void) => {
          runtimeListeners = runtimeListeners.filter((item) => item !== listener);
        }),
      },
    },
  });

  await act(async () => {
    root = createRoot(container);
    root.render(React.createElement(ProjectsPage));
  });
}

async function enterProjectName(value: string) {
  await enterInput('项目名称', value);
}

async function enterInput(placeholder: string, value: string) {
  const input = inputByPlaceholder(placeholder);
  await act(async () => {
    setInputValue(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function clickCreateProject() {
  await clickButton('创建项目');
}

async function clickButton(label: string) {
  const button = Array.from(container.querySelectorAll('button'))
    .find((candidate) => candidate.textContent === label);
  expect(button).toBeTruthy();
  await act(async () => {
    button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

function projectNameInput(): HTMLInputElement {
  return inputByPlaceholder('项目名称');
}

function inputByPlaceholder(placeholder: string): HTMLInputElement {
  const input = container.querySelector(`input[placeholder="${placeholder}"]`);
  expect(input).toBeInstanceOf(HTMLInputElement);
  return input as HTMLInputElement;
}

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
}

function createProject(id: string, name: string): ProjectContext {
  return {
    id,
    name,
    description: '',
    instructions: '',
    source: {
      kind: 'manual',
      label: 'Manual project',
      importedAt: 1,
    },
    createdAt: 1,
    updatedAt: 1,
  };
}
