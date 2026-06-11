import { defineConfig, type ConfigEnv, type UserManifest } from 'wxt';
import tailwindcss from '@tailwindcss/vite';
import type { Plugin } from 'vite';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readFileSync } from 'node:fs';

const rootDir = dirname(fileURLToPath(import.meta.url));
const safeWxtBrowser = resolve(rootDir, 'core/browser/safe-wxt-browser.ts');
const CHROMIUM_BROWSERS = new Set(['chrome', 'edge']);
const extensionVersion = readPackageVersion();
const MANIFEST_NAME = '__MSG_extension_name__';
const MANIFEST_DESCRIPTION = '__MSG_extension_description__';
const MANIFEST_ACTION_TITLE = '__MSG_extension_action_title__';

function readPackageVersion(): string {
  const packageJson = JSON.parse(
    readFileSync(resolve(rootDir, 'package.json'), 'utf8'),
  ) as { version?: unknown };

  if (typeof packageJson.version !== 'string' || packageJson.version.length === 0) {
    throw new Error('package.json version is required for extension manifest');
  }

  return packageJson.version;
}

function createManifest(env: ConfigEnv): UserManifest {
  const isFirefox = env.browser === 'firefox';
  const isChromiumTarget = CHROMIUM_BROWSERS.has(env.browser);
  const permissions = ['storage', 'alarms', 'nativeMessaging', 'contextMenus'];

  return {
    default_locale: 'en',
    name: MANIFEST_NAME,
    description: MANIFEST_DESCRIPTION,
    version: extensionVersion,
    permissions: isChromiumTarget ? [...permissions, 'sidePanel'] : permissions,
    optional_host_permissions: ['http://*/*', 'https://*/*'],
    host_permissions: ['*://chat.deepseek.com/*', 'https://api.deepseek.com/*', '*://cn.bing.com/*', '*://www.bing.com/*'],
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'",
    },
    web_accessible_resources: [{
      resources: ['pet/*.png', 'deepseek/*.wasm'],
      matches: ['*://chat.deepseek.com/*'],
    }],
    ...(isChromiumTarget ? {
      action: {
        default_title: MANIFEST_ACTION_TITLE,
      },
      side_panel: {
        default_path: 'sidepanel.html',
      },
    } : {}),
    ...(isFirefox ? {
      browser_specific_settings: {
        gecko: {
          id: 'deepseek-pp@zhu1090093659.github',
          data_collection_permissions: {
            required: ['websiteContent', 'personalCommunications'],
          },
        },
      },
    } : {}),
  };
}

function asciiJavaScriptOutputPlugin(): Plugin {
  return {
    name: 'deepseek-pp-ascii-js-output',
    enforce: 'post',
    generateBundle(_, bundle) {
      for (const item of Object.values(bundle)) {
        if (item.type === 'chunk') {
          item.code = escapeNonAsciiJavaScript(item.code);
          continue;
        }

        if (!item.fileName.endsWith('.js')) continue;
        const source = typeof item.source === 'string'
          ? item.source
          : Buffer.from(item.source).toString('utf8');
        item.source = escapeNonAsciiJavaScript(source);
      }
    },
  };
}

function escapeNonAsciiJavaScript(source: string): string {
  let escaped = '';
  for (const char of source) {
    const codePoint = char.codePointAt(0);
    if (codePoint === undefined || codePoint <= 0x7f) {
      escaped += char;
      continue;
    }
    escaped += codePoint <= 0xffff
      ? `\\u${codePoint.toString(16).padStart(4, '0')}`
      : toSurrogatePairEscape(codePoint);
  }
  return escaped;
}

function toSurrogatePairEscape(codePoint: number): string {
  const value = codePoint - 0x10000;
  const high = 0xd800 + (value >> 10);
  const low = 0xdc00 + (value & 0x3ff);
  return `\\u${high.toString(16).padStart(4, '0')}\\u${low.toString(16).padStart(4, '0')}`;
}

export default defineConfig({
  outDir: 'dist',
  targetBrowsers: ['chrome', 'edge', 'firefox'],
  modules: ['@wxt-dev/module-react'],
  manifest: createManifest,
  vite: () => ({
    plugins: [tailwindcss(), asciiJavaScriptOutputPlugin()],
    resolve: {
      alias: {
        '@wxt-dev/browser': safeWxtBrowser,
        'wxt/browser': safeWxtBrowser,
      },
    },
  }),
});
