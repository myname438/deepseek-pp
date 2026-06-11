import type { ProjectFileInput, ProjectSourceKind } from './types';

export const MAX_PROJECT_FILE_BYTES = 512 * 1024;
export const MAX_PROJECT_IMPORT_FILES = 200;

const SKIP_DIRS = new Set([
  '.git', '.github', 'node_modules', 'dist', 'build', '.next', '.nuxt', 'vendor',
  'target', '__pycache__', '.idea', '.vscode', 'coverage',
]);

const TEXT_EXTENSIONS = new Set([
  'js', 'ts', 'jsx', 'tsx', 'mjs', 'cjs', 'html', 'css', 'scss', 'json', 'jsonc',
  'md', 'mdx', 'txt', 'py', 'java', 'kt', 'kts', 'go', 'rs', 'rb', 'php', 'sh',
  'bash', 'zsh', 'yml', 'yaml', 'toml', 'ini', 'csv', 'sql', 'xml', 'env',
  'dockerfile', 'makefile', 'gradle', 'swift', 'dart',
]);

export interface ParsedGitHubRepository {
  owner: string;
  repo: string;
  ref: string;
  pathPrefix: string;
}

export function parseGitHubRepository(input: string): ParsedGitHubRepository | null {
  const value = input.trim().replace(/\/+$/, '');
  const shorthand = /^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)$/.exec(value);
  if (shorthand) {
    return { owner: shorthand[1], repo: shorthand[2], ref: 'main', pathPrefix: '' };
  }

  try {
    const url = new URL(value);
    if (url.hostname !== 'github.com') return null;
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length < 2) return null;
    const [owner, repo] = parts;
    if (parts[2] === 'tree' && parts[3]) {
      return {
        owner,
        repo,
        ref: parts[3],
        pathPrefix: parts.slice(4).join('/'),
      };
    }
    return { owner, repo, ref: 'main', pathPrefix: '' };
  } catch {
    return null;
  }
}

export function normalizeProjectFiles(
  files: readonly ProjectFileInput[],
  sourceKind: ProjectSourceKind,
): ProjectFileInput[] {
  const normalized: ProjectFileInput[] = [];
  for (const file of files) {
    const path = normalizePath(file.path);
    if (!path || shouldSkipPath(path)) continue;
    const content = String(file.content ?? '');
    if (!content.trim() || content.includes('\0')) continue;
    if (new TextEncoder().encode(content).length > MAX_PROJECT_FILE_BYTES) continue;
    if (!isTextProjectPath(path)) continue;
    normalized.push({ path, content, sourceKind });
    if (normalized.length >= MAX_PROJECT_IMPORT_FILES) break;
  }
  return normalized.sort((a, b) => a.path.localeCompare(b.path));
}

export async function fetchGitHubProjectFiles(
  input: string,
  options: { token?: string; fetchImpl?: typeof fetch } = {},
): Promise<{ source: ParsedGitHubRepository; files: ProjectFileInput[]; warnings: string[] }> {
  const source = parseGitHubRepository(input);
  if (!source) throw new Error('Invalid GitHub repository URL.');
  const fetchImpl = options.fetchImpl ?? fetch;
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
  };
  if (options.token?.trim()) headers.Authorization = `Bearer ${options.token.trim()}`;

  let tree: { tree: Array<{ path?: string; type?: string; size?: number }> } | null = null;
  let resolvedSource = source;
  for (const candidate of getGitHubTreeSourceCandidates(input, source)) {
    tree = await fetchTree(fetchImpl, candidate, headers);
    if (tree) {
      resolvedSource = candidate;
      break;
    }
    if (candidate.ref === 'main') {
      const masterCandidate = { ...candidate, ref: 'master' };
      tree = await fetchTree(fetchImpl, masterCandidate, headers);
      if (tree) {
        resolvedSource = masterCandidate;
        break;
      }
    }
  }
  if (!tree) throw new Error(`Could not read GitHub tree for ${source.owner}/${source.repo}@${source.ref}.`);

  const files: ProjectFileInput[] = [];
  const warnings: string[] = [];
  for (const item of tree.tree) {
    if (item.type !== 'blob' || !item.path) continue;
    if (resolvedSource.pathPrefix && !item.path.startsWith(`${resolvedSource.pathPrefix}/`)) continue;
    const relativePath = resolvedSource.pathPrefix
      ? item.path.slice(resolvedSource.pathPrefix.length + 1)
      : item.path;
    if (shouldSkipPath(relativePath) || !isTextProjectPath(relativePath)) continue;
    if ((item.size ?? 0) > MAX_PROJECT_FILE_BYTES) continue;
    const rawUrl = `https://raw.githubusercontent.com/${resolvedSource.owner}/${resolvedSource.repo}/${encodeURIComponent(resolvedSource.ref).replace(/%2F/g, '/')}/${item.path.split('/').map(encodeURIComponent).join('/')}`;
    const response = await fetchImpl(rawUrl, { headers: options.token ? { Authorization: `Bearer ${options.token.trim()}` } : undefined });
    if (!response.ok) {
      warnings.push(`Skipped ${relativePath}: ${formatGitHubHttpError(response.status)}`);
      continue;
    }
    const content = await response.text();
    files.push({ path: relativePath, content, sourceKind: 'github' });
    if (files.length >= MAX_PROJECT_IMPORT_FILES) break;
  }

  return {
    source: resolvedSource,
    files: normalizeProjectFiles(files, 'github'),
    warnings,
  };
}

function getGitHubTreeSourceCandidates(
  input: string,
  fallback: ParsedGitHubRepository,
): ParsedGitHubRepository[] {
  const candidates: ParsedGitHubRepository[] = [];
  try {
    const url = new URL(input.trim().replace(/\/+$/, ''));
    if (url.hostname === 'github.com') {
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts.length >= 4 && parts[2] === 'tree') {
        const [owner, repo] = parts;
        const suffix = parts.slice(3);
        for (let index = suffix.length; index >= 1; index -= 1) {
          candidates.push({
            owner,
            repo,
            ref: suffix.slice(0, index).join('/'),
            pathPrefix: suffix.slice(index).join('/'),
          });
        }
      }
    }
  } catch {
    // Shorthand inputs have no tree/ref ambiguity, so the fallback is enough.
  }

  candidates.push(fallback);
  return dedupeGitHubSources(candidates);
}

function dedupeGitHubSources(sources: readonly ParsedGitHubRepository[]): ParsedGitHubRepository[] {
  const seen = new Set<string>();
  return sources.filter((source) => {
    const key = `${source.owner}/${source.repo}@${source.ref}:${source.pathPrefix}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizePath(path: string): string {
  return String(path || '').replace(/\\/g, '/').replace(/^\/+/, '').trim();
}

function shouldSkipPath(path: string): boolean {
  return normalizePath(path).split('/').some((part) => SKIP_DIRS.has(part));
}

function isTextProjectPath(path: string): boolean {
  const fileName = path.split('/').pop()?.toLowerCase() ?? '';
  if (!fileName) return false;
  if (TEXT_EXTENSIONS.has(fileName)) return true;
  const ext = fileName.includes('.') ? fileName.split('.').pop() ?? '' : '';
  return TEXT_EXTENSIONS.has(ext);
}

async function fetchTree(
  fetchImpl: typeof fetch,
  source: ParsedGitHubRepository,
  headers: Record<string, string>,
): Promise<{ tree: Array<{ path?: string; type?: string; size?: number }> } | null> {
  const url = `https://api.github.com/repos/${source.owner}/${source.repo}/git/trees/${encodeURIComponent(source.ref).replace(/%2F/g, '/')}?recursive=1`;
  const response = await fetchImpl(url, { headers });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(formatGitHubHttpError(response.status));
  const json = await response.json();
  if (!json || typeof json !== 'object' || !Array.isArray((json as { tree?: unknown }).tree)) {
    throw new Error('GitHub tree response is invalid.');
  }
  return json as { tree: Array<{ path?: string; type?: string; size?: number }> };
}

function formatGitHubHttpError(status: number): string {
  if (status === 401) {
    return 'GitHub authentication failed. Check that the token is valid and has repository read access.';
  }
  if (status === 403) {
    return 'GitHub API returned HTTP 403. The repository may require authentication, or the anonymous API rate limit may be exhausted. Enter a GitHub token with repository read access and try again.';
  }
  return `GitHub API returned HTTP ${status}.`;
}
