/**
 * Handles runtime messages from extension components.
 * Processes style updates for YouTube Music tabs and settings updates.
 *
 * @param {Object} request - The message request object
 * @param {string} request.action - The action type ('applyStyles' or 'updateSettings')
 * @param {string} [request.ricsSource] - RICS source code for applyStyles action
 * @param {Object} [request.settings] - Settings object for updateSettings action
 * @returns {boolean} Returns true to indicate asynchronous response
 */

import { buildStoreThemeContent, saveCustomCss } from "@core/customCss";
import { getAppliedStoreThemeId, getLocalStorage, getSyncStorage } from "@core/storage";
import { initBackgroundAuth } from "@modules/auth/backgroundAuth";
import {
  getInstalledStoreThemes,
  getInstalledTheme,
  installSymlinkedThemeFromMarketplace,
  performSilentUpdates,
  performUrlThemeUpdates,
  setActiveStoreTheme,
} from "./store/themeStoreManager";
import { fetchAllStoreThemes } from "./store/themeStoreService";
import { logBackground, warnBackground } from "@core/logger";
import { initDirectLyrics, isMusicPage } from "./directLyrics";

const THEME_UPDATE_ALARM = "theme-update-check";
const UPDATE_INTERVAL_MS = 6 * 60 * 60 * 1000;
let maintenance: Promise<void> | null = null;

// -- Symlinked Theme Migration --------------------------

const SYMLINKED_MIGRATION_KEY = "symlinkedMigrationVersion";
const SYMLINKED_MIGRATION_VERSION = 1;

const SYMLINKED_THEME_MAP: Record<string, string> = {
  Minimal: "minimal",
  "Dynamic Background": "dynamic-background",
  "Apple Music": "apple-music",
};

async function migrateSymlinkedThemes(): Promise<void> {
  try {
    const result = await getLocalStorage<{ [SYMLINKED_MIGRATION_KEY]?: number }>([SYMLINKED_MIGRATION_KEY]);
    if ((result[SYMLINKED_MIGRATION_KEY] ?? 0) >= SYMLINKED_MIGRATION_VERSION) return;

    const syncData = await getSyncStorage<{ themeName?: string }>(["themeName"]);
    const themeName = syncData.themeName;

    if (themeName && !themeName.startsWith("store:")) {
      const storeId = SYMLINKED_THEME_MAP[themeName];
      if (storeId) {
        logBackground(`Migrating symlinked theme: ${themeName} → store:${storeId}`);
        await chrome.storage.sync.set({ themeName: `store:${storeId}` });
        await setActiveStoreTheme(storeId);
        const installed = await installSymlinkedThemeFromMarketplace(storeId);
        if (!installed) {
          await chrome.storage.sync.set({ themeName });
          await chrome.storage.sync.remove("activeStoreTheme");
          return;
        }
        await saveCustomCss(buildStoreThemeContent(installed.title, installed.creators, installed.css));
        logBackground(`Migrated active theme: ${themeName} → store:${storeId}`);
      }
    }

    await chrome.storage.local.set({ [SYMLINKED_MIGRATION_KEY]: SYMLINKED_MIGRATION_VERSION });
  } catch (err) {
    warnBackground("Symlinked themes migration failed:", err);
  }
}

// -- Applied Theme CSS Resync --------------------------

const THEME_CSS_RESYNC_KEY = "appliedThemeCssResyncVersion";
const THEME_CSS_RESYNC_VERSION = 1;

/** Heals installs that auto-updated before the write path was fixed. */
async function resyncAppliedThemeCss(): Promise<void> {
  try {
    const stored = await getLocalStorage<{ [THEME_CSS_RESYNC_KEY]?: number }>([THEME_CSS_RESYNC_KEY]);
    if ((stored[THEME_CSS_RESYNC_KEY] ?? 0) >= THEME_CSS_RESYNC_VERSION) return;

    const themeId = await getAppliedStoreThemeId();
    const theme = themeId ? await getInstalledTheme(themeId) : null;

    if (theme?.css) {
      const result = await saveCustomCss(buildStoreThemeContent(theme.title, theme.creators, theme.css));
      if (!result.success) {
        warnBackground(`Failed to resync applied theme: ${theme.title}`, result.error);
        return;
      }
      logBackground(`Resynced applied theme: ${theme.title} v${theme.version}`);
    }

    await chrome.storage.local.set({ [THEME_CSS_RESYNC_KEY]: THEME_CSS_RESYNC_VERSION });
  } catch (err) {
    warnBackground("Applied theme resync failed:", err);
  }
}

async function checkAndApplyThemeUpdates(): Promise<void> {
  try {
    const installed = await getInstalledStoreThemes();
    if (installed.length === 0) return;

    logBackground("Checking for theme updates...");
    const storeThemes = await fetchAllStoreThemes();
    const marketplaceUpdatedIds = await performSilentUpdates(storeThemes);
    const urlUpdatedIds = await performUrlThemeUpdates();
    const updatedIds = [...marketplaceUpdatedIds, ...urlUpdatedIds];

    if (updatedIds.length > 0) {
      logBackground(`Updated ${updatedIds.length} theme(s):`, updatedIds.join(", "));
    }
  } catch (err) {
    warnBackground("Theme update check failed:", err);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  void chrome.alarms.clear(THEME_UPDATE_ALARM);
});

async function maintainOnMusicPage(): Promise<void> {
  if (maintenance) return maintenance;
  maintenance = (async () => {
    await chrome.alarms.clear(THEME_UPDATE_ALARM);
    await migrateSymlinkedThemes();
    await resyncAppliedThemeCss();
    const stored = await getLocalStorage<{ musicPageThemeCheck?: number }>(["musicPageThemeCheck"]);
    if (Date.now() - (stored.musicPageThemeCheck || 0) < UPDATE_INTERVAL_MS) return;
    await chrome.storage.local.set({ musicPageThemeCheck: Date.now() });
    await checkAndApplyThemeUpdates();
  })().finally(() => {
    maintenance = null;
  });
  return maintenance;
}

chrome.runtime.onMessage.addListener((request, sender) => {
  if (request.action === "musicPageReady" && isMusicPage(sender.url) && sender.tab) {
    void maintainOnMusicPage().catch(error => warnBackground("Music page maintenance failed:", error));
  }
  if (request.action === "applyStyles") {
    chrome.tabs.query({ url: "*://music.youtube.com/*" }, tabs => {
      tabs.forEach(tab => {
        if (tab.id != null) {
          chrome.tabs.sendMessage(tab.id, { action: "applyStyles", ricsSource: request.ricsSource }).catch(err => {
            warnBackground(`Failed to send message to tab ${tab.id}:`, err);
          });
        }
      });
    });
  }
  return false;
});

initBackgroundAuth();
initDirectLyrics();
