/**
 * AliExpress Global Switcher - Background Service Worker
 * @author svtcore (enhanced for quick 1-click delivery presets)
 * @license MIT
 * @link https://github.com/svtcore
 */

import {
  ALIEXPRESS_DOMAINS,
  DEFAULT_SETTINGS,
  STORAGE_KEY
} from './config.js';

/**
 * Manages AliExpress regional global redirects, quick-switch presets,
 * browser action badge, and cookie configuration.
 */
class AliExpressSwitcher {

  /** @type {string} */
  static TAG = '[AliExpress Switcher]';

  constructor() {
    this.#ensureDefaults();
    this.#registerListeners();
    this.#clearBadge();
  }

  // Storage

  /** Ensure default settings exist on first install */
  #ensureDefaults() {
    chrome.storage.sync.get(STORAGE_KEY, (result) => {
      if (!result[STORAGE_KEY]) {
        this.#save(DEFAULT_SETTINGS);
        console.log(AliExpressSwitcher.TAG, 'Default settings created');
      }
      this.#clearBadge();
    });
  }

  /** Clear browser action badge text so the delivery truck icon is completely visible */
  #clearBadge() {
    try {
      chrome.action.setBadgeText({ text: '' });
    } catch (err) {
      console.warn(AliExpressSwitcher.TAG, 'Failed to clear badge:', err);
    }
  }

  /** @returns {Promise<object>} current settings */
  #load() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(STORAGE_KEY, (result) => {
        try {
          resolve(result[STORAGE_KEY]
            ? JSON.parse(result[STORAGE_KEY])
            : { ...DEFAULT_SETTINGS });
        } catch {
          resolve({ ...DEFAULT_SETTINGS });
        }
      });
    });
  }

  /** Persist settings to chrome.storage.sync */
  #save(settings) {
    chrome.storage.sync.set(
      { [STORAGE_KEY]: JSON.stringify(settings) },
      () => console.log(AliExpressSwitcher.TAG, 'Settings saved')
    );
  }

  // URL helpers

  /**
   * Check whether a URL belongs to any AliExpress domain
   * @param {string} url
   * @returns {boolean}
    */
  #isAliExpress(url) {
    try {
      const host = new URL(url).hostname;
      return ALIEXPRESS_DOMAINS.tlds.some((tld) => host.endsWith(tld));
    } catch {
      return false;
    }
  }

  /**
   * Check whether a URL is a sensitive checkout, payment, trade, or banking endpoint.
   * Such URLs must never be interrupted, redirected, or reloaded automatically.
   * @param {string} url
   * @returns {boolean}
   */
  #isSensitiveUrl(url) {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.toLowerCase();
      const path = parsed.pathname.toLowerCase();
      return (
        host.startsWith('checkout.') ||
        host.startsWith('trade.') ||
        host.startsWith('pay.') ||
        host.startsWith('payment.') ||
        host.startsWith('cashier.') ||
        host.includes('alipay.') ||
        path.includes('/trade') ||
        path.includes('/checkout') ||
        path.includes('/payment') ||
        path.includes('/order') ||
        path.includes('/pay/')
      );
    } catch {
      return false;
    }
  }

  /**
   * Check whether a URL must be redirected to global AliExpress.
   * Strictly targets .ru domains and forced Russian parameters.
   * @param {string} url
   * @returns {boolean}
   */
  #needsRedirect(url) {
    try {
      // Never intercept sensitive checkout or payment flows
      if (this.#isSensitiveUrl(url)) {
        return false;
      }

      const parsed = new URL(url);
      const host = parsed.hostname;

      // Never intercept intermediate affiliate resolution endpoints
      if (parsed.pathname.includes('/aff/redirect') || parsed.pathname.includes('/aer-cookie/') || parsed.pathname.includes('/aer-api/')) {
        return false;
      }

      // Strictly redirect Russian domains (*.aliexpress.ru)
      if (host.endsWith('aliexpress.ru')) {
        return true;
      }

      // If URL has parameter explicitly forcing Russian domain
      if (parsed.searchParams.get('gatewayAdapt') === 'glo2rus') {
        return true;
      }

      return false;
    } catch {
      return false;
    }
  }

  /**
   * Convert any regional Russian URL to the global version
   * @param {string} url
   * @returns {string}
   */
  #toPreferredUrl(url) {
    try {
      const parsed = new URL(url);
      parsed.searchParams.delete('gatewayAdapt');

      if (parsed.hostname.endsWith('aliexpress.ru')) {
        parsed.hostname = 'www.aliexpress.com';
      }

      return parsed.href;
    } catch {
      return 'https://www.aliexpress.com';
    }
  }

  // Cookie management

  /**
   * Build the setCommonCookie URL for a given host.
   * @param {string} host - e.g. 'login.aliexpress.com'
   * @param {object} settings
   * @returns {string}
   */
  #buildCookieUrl(host, settings) {
    const params = new URLSearchParams({
      fromApp: 'false',
      currency: settings.currency || 'EUR',
      region: (settings.region || 'UA').toUpperCase(),
      bLocale: settings.locale || 'ru_RU',
      site: settings.site || 'glo',
      province: '',
      city: ''
    });
    return `https://${host}/setCommonCookie.htm?${params}`;
  }

  /**
   * Directly write the aep_usuc_f cookie via Chrome cookie API for instant effect
   * @param {object} settings
   */
  async #setDirectCookies(settings) {
    const cookieValue = `site=${settings.site || 'glo'}&c_tp=${settings.currency || 'EUR'}&region=${(settings.region || 'UA').toUpperCase()}&b_locale=${settings.locale || 'ru_RU'}`;

    try {
      await chrome.cookies.set({
        url: 'https://www.aliexpress.com',
        domain: '.aliexpress.com',
        name: 'aep_usuc_f',
        value: cookieValue,
        path: '/',
        secure: true,
        sameSite: 'no_restriction'
      });
    } catch (err) {
      console.warn(AliExpressSwitcher.TAG, 'Direct cookie set warning:', err);
    }
  }

  /**
   * Set AliExpress cookies on all relevant domains.
   * @param {object} settings
   */
  async #setCookies(settings) {
    const opts = { credentials: 'include' };
    const requests = ALIEXPRESS_DOMAINS.cookieHosts.map((host) =>
      fetch(this.#buildCookieUrl(host, settings), opts).catch(() => {})
    );
    await Promise.allSettled(requests);
  }

  /**
   * Thoroughly clear all aep_usuc_f cookies across all domains to prevent stale ghost cookies
   */
  async #clearCookies() {
    try {
      const allCookies = await chrome.cookies.getAll({ name: 'aep_usuc_f' });
      for (const c of allCookies) {
        if (c.domain.includes('aliexpress')) {
          const proto = c.secure ? 'https:' : 'http:';
          const domain = c.domain.startsWith('.') ? c.domain.slice(1) : c.domain;
          const url = `${proto}//${domain}${c.path}`;
          await chrome.cookies.remove({ url, name: c.name }).catch(() => {});
        }
      }
    } catch (err) {
      console.warn(AliExpressSwitcher.TAG, 'Cookie cleanup warning:', err);
    }
  }

  /**
   * Pre-set EU / GDPR consent cookies to prevent annoying cookie banners when switching to PL, DE, etc.
   */
  async #setConsentCookies() {
    const domains = ['.aliexpress.com', 'www.aliexpress.com'];
    const nowIso = new Date().toISOString();
    const oneYearLater = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60;

    const consentCookies = [
      { name: 'OptanonAlertBoxClosed', value: nowIso },
      { name: 'OptanonConsent', value: `isGpcEnabled=0&datestamp=${encodeURIComponent(nowIso)}&version=202401.1.0&browserGpcFlag=0&isIABGlobal=false&hosts=&consentId=ae-auto-consent&interactionCount=1&isAnonUser=1&landingPath=NotLandingPage&groups=C0001%3A1%2CC0002%3A1%2CC0003%3A1%2CC0004%3A1` },
      { name: 'aep_cookie_consent', value: 'all' },
      { name: 'xman_consent', value: 'all' },
      { name: 'intl_consent', value: 'agree' }
    ];

    for (const domain of domains) {
      for (const c of consentCookies) {
        try {
          await chrome.cookies.set({
            url: 'https://www.aliexpress.com',
            domain: domain,
            name: c.name,
            value: c.value,
            path: '/',
            expirationDate: oneYearLater,
            secure: true,
            sameSite: 'no_restriction'
          });
        } catch (err) {
          // Ignore domain variations
        }
      }
    }
  }

  /**
   * Safely reloads a tab only if it is not on a sensitive checkout/payment/trade page
   * @param {number|null} tabId
   */
  #safelyReloadTab(tabId) {
    if (!tabId) return;
    chrome.tabs.get(tabId, (tab) => {
      if (tab?.url && this.#isAliExpress(tab.url) && !this.#isSensitiveUrl(tab.url)) {
        chrome.tabs.reload(tabId);
      }
    });
  }

  /**
   * Safely reloads the active tab only if it is not on a sensitive checkout/payment/trade page
   */
  #safelyReloadActiveTab() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id && tabs[0]?.url && this.#isAliExpress(tabs[0].url) && !this.#isSensitiveUrl(tabs[0].url)) {
        chrome.tabs.reload(tabs[0].id);
      }
    });
  }

  /**
   * Quick-switch delivery country, apply cookies immediately and refresh target tab.
   * @param {string} region - 'ua', 'pl', or 'de'
   * @param {number|null} targetTabId - optional tab ID to reload
   */
  async switchCountry(region, targetTabId = null) {
    const settings = await this.#load();
    settings.region = region.toLowerCase();
    if (!settings.currency) settings.currency = 'UAH';
    if (!settings.locale) settings.locale = 'uk_UA';
    settings.applySettings = false; // Applied directly

    this.#save(settings);

    try {
      await this.#clearCookies();
      await this.#setDirectCookies(settings);
      await this.#setConsentCookies();
    } catch (err) {
      console.warn(AliExpressSwitcher.TAG, 'Cookie prep warning:', err);
    }

    // Fire background server cookie sync without waiting/blocking
    this.#setCookies(settings).catch(() => {});

    // Instantly refresh current or specified tab (ignoring sensitive checkout/payment tabs)
    if (targetTabId) {
      this.#safelyReloadTab(targetTabId);
    } else {
      this.#safelyReloadActiveTab();
    }
  }

  /**
   * Quick-switch currency, apply cookies immediately and refresh target tab.
   * @param {string} currency - e.g. 'UAH', 'EUR', 'USD'
   * @param {number|null} targetTabId
   */
  async switchCurrency(currency, targetTabId = null) {
    const settings = await this.#load();
    settings.currency = currency.toUpperCase();
    if (!settings.region) settings.region = 'ua';
    if (!settings.locale) settings.locale = 'uk_UA';
    settings.applySettings = false;

    this.#save(settings);

    try {
      await this.#clearCookies();
      await this.#setDirectCookies(settings);
      await this.#setConsentCookies();
    } catch (err) {
      console.warn(AliExpressSwitcher.TAG, 'Cookie prep warning:', err);
    }

    this.#setCookies(settings).catch(() => {});

    if (targetTabId) {
      this.#safelyReloadTab(targetTabId);
    } else {
      this.#safelyReloadActiveTab();
    }
  }

  /**
   * Quick-switch language/locale, apply cookies immediately and refresh target tab.
   * @param {string} locale - e.g. 'uk_UA', 'en_US', 'ru_RU'
   * @param {number|null} targetTabId
   */
  async switchLocale(locale, targetTabId = null) {
    const settings = await this.#load();
    settings.locale = locale;
    if (!settings.region) settings.region = 'ua';
    if (!settings.currency) settings.currency = 'UAH';
    settings.applySettings = false;

    this.#save(settings);

    try {
      await this.#clearCookies();
      await this.#setDirectCookies(settings);
      await this.#setConsentCookies();
    } catch (err) {
      console.warn(AliExpressSwitcher.TAG, 'Cookie prep warning:', err);
    }

    this.#setCookies(settings).catch(() => {});

    const updateOrReload = (tab) => {
      if (!tab?.id || !tab?.url || this.#isSensitiveUrl(tab.url)) return;
      if (this.#needsRedirect(tab.url)) {
        const targetUrl = this.#toPreferredUrl(tab.url);
        chrome.tabs.update(tab.id, { url: targetUrl }).catch(() => {});
      } else {
        chrome.tabs.reload(tab.id).catch(() => {});
      }
    };

    if (targetTabId) {
      chrome.tabs.get(targetTabId, (tab) => {
        if (tab) updateOrReload(tab);
      });
    } else {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          updateOrReload(tabs[0]);
        }
      });
    }
  }

  /**
   * Apply custom region, currency, and locale combination immediately
   */
  async applyCustom(region, currency, locale, targetTabId = null) {
    const settings = await this.#load();
    if (region) settings.region = region.toLowerCase();
    if (currency) settings.currency = currency.toUpperCase();
    if (locale) settings.locale = locale;
    settings.applySettings = false;

    this.#save(settings);

    try {
      await this.#clearCookies();
      await this.#setDirectCookies(settings);
      await this.#setConsentCookies();
    } catch (err) {
      console.warn(AliExpressSwitcher.TAG, 'Cookie prep warning:', err);
    }

    this.#setCookies(settings).catch(() => {});

    if (targetTabId) {
      this.#safelyReloadTab(targetTabId);
    } else {
      this.#safelyReloadActiveTab();
    }
  }

  // Event listeners

  #registerListeners() {
    /**
     * Listen for messages from content scripts and popup UI
     */
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'switchCountry') {
        const tabId = sender.tab ? sender.tab.id : null;
        this.switchCountry(request.region, tabId).then(() => {
          sendResponse({ success: true, region: request.region });
        });
        return true; // Keep channel open for async response
      }

      if (request.action === 'switchCurrency') {
        const tabId = sender.tab ? sender.tab.id : null;
        this.switchCurrency(request.currency, tabId).then(() => {
          sendResponse({ success: true, currency: request.currency });
        });
        return true;
      }

      if (request.action === 'switchLocale') {
        const tabId = sender.tab ? sender.tab.id : null;
        this.switchLocale(request.locale, tabId).then(() => {
          sendResponse({ success: true, locale: request.locale });
        });
        return true;
      }

      if (request.action === 'applyCustom') {
        const tabId = sender.tab ? sender.tab.id : null;
        this.applyCustom(request.region, request.currency, request.locale, tabId).then(() => {
          sendResponse({ success: true });
        });
        return true;
      }

      if (request.action === 'getSettings') {
        this.#load().then((settings) => {
          sendResponse({ settings });
        });
        return true;
      }

      if (request.action === 'saveWidgetPos') {
        this.#load().then((settings) => {
          settings.widgetPos = request.pos;
          this.#save(settings);
          sendResponse({ success: true });
        });
        return true;
      }
    });

    /**
     * Clean tab redirect history when tab closes
     */
    chrome.tabs.onRemoved.addListener((tabId) => {
      this.#tabRedirects.delete(tabId);
    });

    /**
     * webNavigation.onBeforeNavigate fires before network request
     * Filtered strictly to aliexpress.ru - never touches regular aliexpress.com pages
     */
    chrome.webNavigation.onBeforeNavigate.addListener(
      (details) => {
        if (details.frameId !== 0) return;
        this.#onBeforeNavigate(details);
      },
      {
        url: [
          { hostSuffix: 'aliexpress.ru' }
        ]
      }
    );

    /**
     * webNavigation.onCommitted fires when navigation is confirmed (catches affiliate shortlink landings)
     * Filtered strictly to aliexpress.ru
     */
    chrome.webNavigation.onCommitted.addListener(
      (details) => {
        if (details.frameId !== 0) return;
        this.#onCommitted(details);
      },
      {
        url: [
          { hostSuffix: 'aliexpress.ru' }
        ]
      }
    );

    /**
     * tabs.onUpdated handles settings application on page complete
     */
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === 'complete' && tab.url && this.#isAliExpress(tab.url)) {
        this.#onPageComplete(tabId, tab);
      }
    });
  }

  /** Anti-loop protection: tracks recent redirects per tab */
  #tabRedirects = new Map();

  /**
   * Safely redirects a tab with a circuit breaker against infinite loops
   */
  #safeRedirectTab(tabId, targetUrl) {
    if (!tabId || !targetUrl) return false;
    const now = Date.now();
    const entry = this.#tabRedirects.get(tabId) || { count: 0, lastTime: 0, targetUrl: '' };

    // Prevent redirecting to the exact same URL within 3 seconds
    if (entry.targetUrl === targetUrl && (now - entry.lastTime) < 3000) {
      return false;
    }

    // Circuit breaker: max 2 redirects per tab within 4 seconds
    if ((now - entry.lastTime) < 4000) {
      if (entry.count >= 2) {
        console.warn(AliExpressSwitcher.TAG, 'Redirect loop blocked for tab', tabId);
        return false;
      }
      entry.count++;
    } else {
      entry.count = 1;
    }

    entry.lastTime = now;
    entry.targetUrl = targetUrl;
    this.#tabRedirects.set(tabId, entry);

    chrome.tabs.update(tabId, { url: targetUrl }).catch(() => {});
    console.log(AliExpressSwitcher.TAG, 'Safe redirect to', targetUrl);
    return true;
  }

  /**
   * Handle onCommitted - catches redirects that passed through external link shorteners (ali.click)
   * @param {{ tabId: number, url: string }} details
   */
  async #onCommitted(details) {
    const settings = await this.#load();
    if (!settings.globalMode) return;
    if (!this.#needsRedirect(details.url)) return;

    try {
      const targetUrl = this.#toPreferredUrl(details.url);
      if (targetUrl !== details.url) {
        this.#safeRedirectTab(details.tabId, targetUrl);
      }
    } catch (err) {
      console.error(AliExpressSwitcher.TAG, 'Committed redirect failed:', err);
    }
  }

  /**
   * @param {{ tabId: number, url: string }} details
   */
  async #onBeforeNavigate(details) {
    const settings = await this.#load();
    if (!settings.globalMode) return;
    if (!this.#needsRedirect(details.url)) return;

    try {
      this.#setDirectCookies(settings).catch(() => {});
      this.#setConsentCookies().catch(() => {});
      this.#setCookies(settings).catch(() => {});

      const targetUrl = this.#toPreferredUrl(details.url);
      if (targetUrl !== details.url) {
        this.#safeRedirectTab(details.tabId, targetUrl);
      }
    } catch (err) {
      console.error(AliExpressSwitcher.TAG, 'Fast redirect failed:', err);
    }
  }

  /**
   * Fires after page fully loads - re-applies cookies/region when the user
   * changed settings in the popup (applySettings flag)
   */
  async #onPageComplete(tabId, tab) {
    if (!tab?.url || this.#isSensitiveUrl(tab.url)) return;
    const settings = await this.#load();
    if (!settings.applySettings) return;

    try {
      await this.#clearCookies();
      await this.#setDirectCookies(settings);
      await this.#setConsentCookies();
      await this.#setCookies(settings);

      settings.applySettings = false;
      this.#save(settings);

      const targetUrl = this.#toPreferredUrl(tab.url);
      chrome.tabs.update(tabId, { url: targetUrl }).catch(() => {});
      console.log(AliExpressSwitcher.TAG, 'Settings applied, redirected to ', targetUrl);
    } catch (err) {
      console.error(AliExpressSwitcher.TAG, 'Apply settings failed:', err);
    }
  }
}

// Bootstrap

new AliExpressSwitcher();