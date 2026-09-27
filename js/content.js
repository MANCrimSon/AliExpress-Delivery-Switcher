/**
 * AliExpress Global Switcher - Content Script
 * 1. Automatically suppresses and accepts annoying EU/GDPR cookie banners (OneTrust, AliExpress Cookie Notices).
 * 2. Injects an isolated, floating on-page 1-click delivery country switcher at ~3/4 of screen width.
 */

(function () {
  'use strict';

  // Prevent multiple injections
  if (window.__aliQuickSwitcherInjected) return;
  window.__aliQuickSwitcherInjected = true;

  // Security & Payment Isolation:
  // Strictly exempt checkout, payment, trade order confirmations, and banking flows.
  // Never inject widgets, manipulate cookies, or alter DOM/styles during sensitive financial flows.
  function isSensitivePage() {
    try {
      const host = location.hostname.toLowerCase();
      const path = location.pathname.toLowerCase();
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

  if (isSensitivePage()) return;

  // Instant client-side escape if landed on aliexpress.ru (e.g. via affiliate ali.click links)
  // Respects the "Global redirect" toggle in settings
  if (location.hostname.endsWith('aliexpress.ru')) {
    if (!location.pathname.includes('/aff/redirect') && !location.pathname.includes('/aer-')) {
      chrome.storage.sync.get('alidata_v2', (data) => {
        let globalMode = true;
        try {
          if (data && data.alidata_v2) {
            const s = typeof data.alidata_v2 === 'string' ? JSON.parse(data.alidata_v2) : data.alidata_v2;
            if (s && s.globalMode === false) globalMode = false;
          }
        } catch (e) {}

        if (globalMode) {
          try {
            const target = new URL(location.href);
            target.hostname = 'www.aliexpress.com';
            target.searchParams.delete('gatewayAdapt');
            location.replace(target.href);
          } catch (e) {}
        }
      });
      return;
    }
  }


  // -------------------------------------------------------------
  // 1. EU / GDPR Cookie Banner Auto-Suppression & Auto-Accept
  // -------------------------------------------------------------

  function injectConsentBlockerStyle() {
    const styleId = 'ali-consent-suppress-style';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      #gdpr-new-container,
      div#gdpr-new-container,
      .gdpr-new-container,
      .gdpr-new-mask,
      #onetrust-banner-sdk,
      #onetrust-consent-sdk,
      .onetrust-pc-dark-filter,
      #onetrust-style,
      .cookie-banner,
      .gdpr-dialog,
      .gdpr-wrap,
      [class*="cookie-banner"],
      [class*="cookie-notice"],
      [class*="gdpr"],
      [id*="gdpr"],
      [id*="cookie-banner"],
      [id*="onetrust"] {
        display: none !important;
        visibility: hidden !important;
        opacity: 0 !important;
        pointer-events: none !important;
        height: 0 !important;
        max-height: 0 !important;
        width: 0 !important;
        overflow: hidden !important;
        z-index: -2147483648 !important;
      }
      html, body {
        overflow: auto !important;
        position: static !important;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  // Inject style immediately at document_start
  injectConsentBlockerStyle();

  function tryAutoAcceptCookieConsent() {
    // 1. Target AliExpress native GDPR container (#gdpr-new-container)
    const gdprContainer = document.querySelector('div#gdpr-new-container, #gdpr-new-container');
    if (gdprContainer) {
      const acceptBtn = gdprContainer.querySelector('button.btn-accept, button.btn-accept-all, button:last-of-type');
      if (acceptBtn && typeof acceptBtn.click === 'function') {
        try { acceptBtn.click(); } catch (e) {}
      }
      try { gdprContainer.remove(); } catch (e) {}
    }

    // 2. Remove only GDPR-specific modal backdrop masks (never touch generic .ui-mask)
    const masks = document.querySelectorAll('.gdpr-new-mask, #gdpr-new-container .ui-mask');
    masks.forEach((m) => {
      try { m.remove(); } catch (e) {}
    });

    // 3. OneTrust and generic CMP consent buttons
    const acceptSelectors = [
      'button.btn-accept',
      '#onetrust-accept-btn-handler',
      '#accept-recommended-btn-handler',
      'button[id*="onetrust-accept"]',
      '.gdpr-confirm-btn',
      '[data-role="gdpr-btn"]',
      'button[data-testid="cookie-accept-all"]',
      'button.onetrust-close-btn-handler'
    ];

    for (const sel of acceptSelectors) {
      const btn = document.querySelector(sel);
      if (btn && typeof btn.click === 'function') {
        try {
          btn.click();
          return true;
        } catch (e) {}
      }
    }
    return false;
  }

  // Watch for dynamic injection of cookie banner buttons to click them silently
  const consentObserver = new MutationObserver(() => {
    tryAutoAcceptCookieConsent();
    if (document.body && document.body.style.overflow === 'hidden') {
      document.body.style.overflow = 'auto';
    }
  });

  function startConsentObserver() {
    injectConsentBlockerStyle();
    tryAutoAcceptCookieConsent();
    if (document.documentElement) {
      consentObserver.observe(document.documentElement, { childList: true, subtree: true });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startConsentObserver);
  } else {
    startConsentObserver();
  }

  // -------------------------------------------------------------
  // 2. On-Page Floating Country Switcher Widget
  // -------------------------------------------------------------

  // -------------------------------------------------------------
  // 2. On-Page Floating 3-Tier Switcher Widget (Countries, Currencies, Languages)
  // -------------------------------------------------------------

  const WIDGET_POS_KEY = 'ali_global_widget_pos_v2';
  const WIDGET_MINIMIZED_KEY = 'ali_global_widget_minimized_v2';

  function getFlagEmoji(code) {
    if (!code || code.length !== 2) return '🌐';
    return String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1F1E6 + c.charCodeAt(0) - 65));
  }

  function getCurrencySymbol(code) {
    const symbols = {
      EUR: '€', USD: '$', UAH: '₴', PLN: 'zł', GBP: '£',
      CAD: 'C$', AUD: 'A$', CHF: 'Fr', JPY: '¥', CNY: '¥',
      TRY: '₺', ILS: '₪', BRL: 'R$', CZK: 'Kč'
    };
    return symbols[code] || code;
  }

  function getLocaleShort(locale) {
    const map = {
      'uk_UA': { flag: '🇺🇦', label: 'UA', title: 'Українська' },
      'ru_RU': { flag: '🇷🇺', label: 'RU', title: 'Русский' },
      'en_US': { flag: '🇬🇧', label: 'EN', title: 'English' },
      'pl_PL': { flag: '🇵🇱', label: 'PL', title: 'Polski' },
      'de_DE': { flag: '🇩🇪', label: 'DE', title: 'Deutsch' },
      'fr_FR': { flag: '🇫🇷', label: 'FR', title: 'Français' },
      'es_ES': { flag: '🇪🇸', label: 'ES', title: 'Español' },
      'it_IT': { flag: '🇮🇹', label: 'IT', title: 'Italiano' },
      'pt_BR': { flag: '🇧🇷', label: 'PT', title: 'Português' },
      'tr_TR': { flag: '🇹🇷', label: 'TR', title: 'Türkçe' },
      'ja_JP': { flag: '🇯🇵', label: 'JA', title: '日本語' },
      'ko_KR': { flag: '🇰🇷', label: 'KO', title: '한국어' }
    };
    return map[locale] || {
      flag: '🌐',
      label: (locale ? locale.slice(0, 2).toUpperCase() : '??'),
      title: locale || 'Язык'
    };
  }

  function initSwitcherWidget() {
    chrome.storage.sync.get(['alidata_v2', WIDGET_POS_KEY, WIDGET_MINIMIZED_KEY], (data) => {
      let settings = null;
      try {
        if (data && data.alidata_v2) {
          settings = typeof data.alidata_v2 === 'string' ? JSON.parse(data.alidata_v2) : data.alidata_v2;
        }
      } catch (e) {}

      if (!settings) {
        settings = {
          region: 'ua',
          currency: 'UAH',
          locale: 'uk_UA',
          showOnPageWidget: true,
          favoriteCountries: ['ua', 'pl', 'de'],
          favoriteCurrencies: ['UAH', 'EUR', 'USD'],
          favoriteLocales: ['uk_UA', 'en_US', 'ru_RU']
        };
      }

      if (settings.showOnPageWidget === false) return;

      const savedPos = data ? data[WIDGET_POS_KEY] : null;
      const isMinimized = !!(data && data[WIDGET_MINIMIZED_KEY]);
      renderWidget(settings, savedPos, isMinimized);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSwitcherWidget);
  } else {
    initSwitcherWidget();
  }

  // Live update: dynamically re-render on-page widget whenever user adds/removes favorites in popup
  try {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'sync' && (changes.alidata_v2 || changes[WIDGET_POS_KEY])) {
        const oldHost = document.getElementById('ali-quick-switch-root');
        if (oldHost) oldHost.remove();
        initSwitcherWidget();
      }
    });
  } catch (e) {}

  function renderWidget(settings, savedPos, isMinimized) {
    if (document.getElementById('ali-quick-switch-root')) return;

    const hostEl = document.createElement('div');
    hostEl.id = 'ali-quick-switch-root';

    function attachHost() {
      if (document.getElementById('ali-quick-switch-root')) return;
      const target = document.body || document.documentElement;
      if (target) {
        target.appendChild(hostEl);
      }
    }

    attachHost();

    // Re-check periodically and observe DOM changes in case AliExpress hydration clears body
    try {
      const observer = new MutationObserver(() => {
        if (!document.getElementById('ali-quick-switch-root')) {
          attachHost();
        }
      });
      observer.observe(document.documentElement, { childList: true });
    } catch (e) {}

    let attachTries = 0;
    const attachInterval = setInterval(() => {
      attachTries++;
      if (!document.getElementById('ali-quick-switch-root')) {
        attachHost();
      }
      if (attachTries > 10) clearInterval(attachInterval);
    }, 1000);

    const shadow = hostEl.attachShadow({ mode: 'open' });

    const currentRegion = (settings.region || 'ua').toLowerCase();
    const currentCurrency = (settings.currency || 'EUR').toUpperCase();
    const currentLocale = settings.locale || 'ru_RU';

    const favCountries = (Array.isArray(settings.favoriteCountries) && settings.favoriteCountries.length)
      ? settings.favoriteCountries
      : ['ua', 'de', 'pl'];

    const favCurrencies = (Array.isArray(settings.favoriteCurrencies) && settings.favoriteCurrencies.length)
      ? settings.favoriteCurrencies
      : ['EUR', 'USD', 'UAH'];

    const favLocales = (Array.isArray(settings.favoriteLocales) && settings.favoriteLocales.length)
      ? settings.favoriteLocales
      : ['uk_UA', 'ru_RU', 'en_US'];

    const style = document.createElement('style');
    style.textContent = `
      :host {
        all: initial;
        z-index: 2147483647;
      }
      .quick-switch-container {
        position: fixed;
        z-index: 2147483647;
        display: flex;
        flex-direction: column;
        gap: 6px;
        background: #ffffff;
        border: 1px solid rgba(0, 0, 0, 0.14);
        border-radius: 14px;
        padding: 6px 10px 8px;
        box-shadow: 0 6px 24px rgba(0, 0, 0, 0.18);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        font-size: 12px;
        line-height: 1;
        transition: box-shadow 0.2s ease, opacity 0.2s ease;
        user-select: none;
        cursor: default;
        width: max-content;
        max-width: 90vw;
      }
      .quick-switch-container.dragging {
        box-shadow: 0 12px 36px rgba(0, 0, 0, 0.3);
        opacity: 0.95;
      }

      /* Header drag bar */
      .widget-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding-bottom: 4px;
        border-bottom: 1px solid #f0f0f2;
        cursor: grab;
        touch-action: none;
        -webkit-user-select: none;
        user-select: none;
      }
      .widget-header:active {
        cursor: grabbing;
      }
      .header-title-box {
        display: flex;
        align-items: center;
        gap: 5px;
      }
      .drag-dots {
        color: #a0a0ab;
        display: flex;
        align-items: center;
      }
      .widget-header-icon {
        display: flex;
        align-items: center;
      }
      .widget-title {
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: #8c8c9e;
      }
      .minimize-btn {
        background: none;
        border: none;
        color: #999;
        cursor: pointer;
        padding: 2px 5px;
        font-size: 13px;
        line-height: 1;
        border-radius: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: color 0.15s, background 0.15s;
      }
      .minimize-btn:hover {
        color: #333;
        background: #f0f0f0;
      }

      /* Tiers */
      .widget-tier {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .tier-label {
        width: 18px;
        height: 18px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        cursor: grab;
        color: #6b7280;
        touch-action: none;
        -webkit-user-select: none;
        user-select: none;
      }
      .tier-label svg {
        display: block;
      }
      .min-item {
        display: inline-flex;
        align-items: center;
      }
      .tier-buttons {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 4px;
      }
      .tier-btn {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 4px 8px;
        border: 1px solid #e2e4e9;
        border-radius: 12px;
        background: #f7f8fa;
        color: #2e384d;
        cursor: pointer;
        font-size: 11px;
        font-weight: 600;
        transition: all 0.15s ease;
        outline: none;
        white-space: nowrap;
      }
      .tier-btn:hover {
        background: #eef0f4;
        border-color: #cbd0d8;
        transform: translateY(-1px);
      }
      .tier-btn.active {
        background: #ff4747;
        color: #ffffff;
        border-color: #ff4747;
        box-shadow: 0 2px 6px rgba(255, 71, 71, 0.4);
      }
      .tier-btn:disabled {
        opacity: 0.6;
        cursor: wait;
      }
      .loading-pulse {
        animation: pulse 1s infinite alternate;
      }
      @keyframes pulse {
        0% { opacity: 0.5; }
        100% { opacity: 1; }
      }

      /* Minimized state */
      .quick-switch-container.minimized {
        flex-direction: row;
        align-items: center;
        gap: 6px;
        padding: 6px 12px;
        border-radius: 20px;
        background: #ffffff;
        border: 1.5px solid #ff4747;
        cursor: pointer;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.16);
      }
      .quick-switch-container.minimized:hover {
        box-shadow: 0 6px 20px rgba(255, 71, 71, 0.25);
        transform: translateY(-1px);
      }
      .quick-switch-container.minimized .widget-header,
      .quick-switch-container.minimized .widget-tier {
        display: none;
      }
      .minimized-pill {
        display: none;
        align-items: center;
        gap: 6px;
        font-size: 11.5px;
        font-weight: 700;
        color: #1a1a2e;
        touch-action: none;
        -webkit-user-select: none;
        user-select: none;
      }
      .quick-switch-container.minimized .minimized-pill {
        display: flex;
      }
      .min-sep {
        color: #d1d5db;
        font-weight: 400;
      }
      .min-expand-icon {
        font-size: 10px;
        color: #9ca3af;
        margin-left: 2px;
      }
    `;

    const container = document.createElement('div');
    container.className = 'quick-switch-container';
    if (isMinimized) {
      container.classList.add('minimized');
    }

    // Position setup: Default is aligned under action column (right: 40px, bottom: 80px)
    if (savedPos && typeof savedPos.left === 'number' && typeof savedPos.top === 'number') {
      container.style.left = `${savedPos.left}px`;
      container.style.top = `${savedPos.top}px`;
    } else {
      container.style.bottom = '80px';
      container.style.right = '40px';
    }

    const SVG_ICONS = {
      truck: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13"></rect><polygon points="16 8 20 8 23 11 23 16 16 8"></polygon><circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle></svg>`,
      currency: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>`,
      globe: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>`,
      headerTruck: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ff4747" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13"></rect><polygon points="16 8 20 8 23 11 23 16 16 8"></polygon><circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle></svg>`,
      miniTruck: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px;margin-right:2px;"><rect x="1" y="3" width="15" height="13"></rect><polygon points="16 8 20 8 23 11 23 16 16 8"></polygon><circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle></svg>`,
      miniGlobe: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px;margin-right:2px;"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>`
    };

    // 1. Header with Drag Handle and Minimize Button
    const header = document.createElement('div');
    header.className = 'widget-header';
    header.innerHTML = `
      <div class="header-title-box">
        <span class="drag-dots" title="Перетащить виджет">
          <svg width="10" height="12" viewBox="0 0 10 14" fill="currentColor">
            <circle cx="2" cy="2" r="1.5"/><circle cx="8" cy="2" r="1.5"/>
            <circle cx="2" cy="7" r="1.5"/><circle cx="8" cy="7" r="1.5"/>
            <circle cx="2" cy="12" r="1.5"/><circle cx="8" cy="12" r="1.5"/>
          </svg>
        </span>
        <span class="widget-header-icon">
          <img src="${chrome.runtime.getURL('icons/icon32.png')}" width="14" height="14" style="border-radius:3px;display:block;" alt="Icon" />
        </span>
        <span class="widget-title">Delivery Switcher</span>
      </div>
    `;

    const minimizeBtn = document.createElement('button');
    minimizeBtn.className = 'minimize-btn';
    minimizeBtn.title = 'Свернуть';
    minimizeBtn.innerHTML = '&#x2212;';
    minimizeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      container.classList.add('minimized');
      try {
        if (chrome?.runtime?.id) {
          chrome.storage.sync.set({ [WIDGET_MINIMIZED_KEY]: true });
        }
      } catch (err) {}
    });
    header.appendChild(minimizeBtn);
    container.appendChild(header);

    // 2. Tier 1: Delivery Countries
    const tier1 = document.createElement('div');
    tier1.className = 'widget-tier';
    const t1Label = document.createElement('span');
    t1Label.className = 'tier-label';
    t1Label.innerHTML = SVG_ICONS.truck;
    t1Label.title = 'Страна доставки';
    tier1.appendChild(t1Label);

    const t1Btns = document.createElement('div');
    t1Btns.className = 'tier-buttons';
    favCountries.forEach((c) => {
      const code = c.toLowerCase();
      const flag = getFlagEmoji(code);
      const label = code.toUpperCase();
      const isActive = code === currentRegion;

      const btn = document.createElement('button');
      btn.className = `tier-btn country-btn ${isActive ? 'active' : ''}`;
      btn.title = `Доставка: ${label}`;
      btn.innerHTML = `<span>${label}</span>`;

      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (btn.classList.contains('active')) return;

        t1Btns.querySelectorAll('.tier-btn').forEach((b) => (b.disabled = true));
        btn.classList.add('loading-pulse');

        setTimeout(() => {
          t1Btns.querySelectorAll('.tier-btn').forEach((b) => (b.disabled = false));
          btn.classList.remove('loading-pulse');
        }, 1500);

        chrome.runtime.sendMessage({ action: 'switchCountry', region: code }, () => {});
      });

      t1Btns.appendChild(btn);
    });
    tier1.appendChild(t1Btns);
    container.appendChild(tier1);

    // 3. Tier 2: Currencies
    const tier2 = document.createElement('div');
    tier2.className = 'widget-tier';
    const t2Label = document.createElement('span');
    t2Label.className = 'tier-label';
    t2Label.innerHTML = SVG_ICONS.currency;
    t2Label.title = 'Валюта';
    tier2.appendChild(t2Label);

    const t2Btns = document.createElement('div');
    t2Btns.className = 'tier-buttons';
    favCurrencies.forEach((cur) => {
      const code = cur.toUpperCase();
      const symbol = getCurrencySymbol(code);
      const curBtnLabel = (symbol && symbol !== code) ? `${symbol} ${code}` : code;
      const isActive = code === currentCurrency;

      const btn = document.createElement('button');
      btn.className = `tier-btn currency-btn ${isActive ? 'active' : ''}`;
      btn.title = `Валюта: ${code}`;
      btn.innerHTML = `<span>${curBtnLabel}</span>`;

      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (btn.classList.contains('active')) return;

        t2Btns.querySelectorAll('.tier-btn').forEach((b) => (b.disabled = true));
        btn.classList.add('loading-pulse');

        setTimeout(() => {
          t2Btns.querySelectorAll('.tier-btn').forEach((b) => (b.disabled = false));
          btn.classList.remove('loading-pulse');
        }, 1500);

        chrome.runtime.sendMessage({ action: 'switchCurrency', currency: code }, () => {});
      });

      t2Btns.appendChild(btn);
    });
    tier2.appendChild(t2Btns);
    container.appendChild(tier2);

    // 4. Tier 3: Languages
    const tier3 = document.createElement('div');
    tier3.className = 'widget-tier';
    const t3Label = document.createElement('span');
    t3Label.className = 'tier-label';
    t3Label.innerHTML = SVG_ICONS.globe;
    t3Label.title = 'Язык сайта';
    tier3.appendChild(t3Label);

    const t3Btns = document.createElement('div');
    t3Btns.className = 'tier-buttons';
    favLocales.forEach((loc) => {
      const locInfo = getLocaleShort(loc);
      const isActive = loc === currentLocale;

      const btn = document.createElement('button');
      btn.className = `tier-btn locale-btn ${isActive ? 'active' : ''}`;
      btn.title = `Язык: ${locInfo.title}`;
      btn.innerHTML = `<span>${locInfo.label}</span>`;

      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (btn.classList.contains('active')) return;

        t3Btns.querySelectorAll('.tier-btn').forEach((b) => (b.disabled = true));
        btn.classList.add('loading-pulse');

        setTimeout(() => {
          t3Btns.querySelectorAll('.tier-btn').forEach((b) => (b.disabled = false));
          btn.classList.remove('loading-pulse');
        }, 1500);

        chrome.runtime.sendMessage({ action: 'switchLocale', locale: loc }, () => {});
      });

      t3Btns.appendChild(btn);
    });
    tier3.appendChild(t3Btns);
    container.appendChild(tier3);

    // 5. Minimized Pill
    const minPill = document.createElement('div');
    minPill.className = 'minimized-pill';
    const minLocaleInfo = getLocaleShort(currentLocale);
    const curSymbol = getCurrencySymbol(currentCurrency);
    const curLabel = (curSymbol && curSymbol !== currentCurrency) ? `${curSymbol} ${currentCurrency}` : currentCurrency;
    minPill.innerHTML = `
      <span class="min-item">${SVG_ICONS.miniTruck}${currentRegion.toUpperCase()}</span>
      <span class="min-sep">·</span>
      <span>${curLabel}</span>
      <span class="min-sep">·</span>
      <span class="min-item">${SVG_ICONS.miniGlobe}${minLocaleInfo.label}</span>
      <span class="min-expand-icon">&#9662;</span>
    `;
    container.appendChild(minPill);

    let hasDragged = false;

    container.addEventListener('click', () => {
      if (hasDragged) {
        hasDragged = false;
        return;
      }
      if (container.classList.contains('minimized')) {
        container.classList.remove('minimized');
        try {
          if (chrome?.runtime?.id) {
            chrome.storage.sync.set({ [WIDGET_MINIMIZED_KEY]: false });
          }
        } catch (err) {}
      }
    });

    // 6. Drag & Drop Handling (Unified Touch & Mouse via Pointer and Touch events)
    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let elemStartX = 0;
    let elemStartY = 0;
    let activePointerId = null;

    function getCoords(e) {
      if (e.touches && e.touches.length > 0) {
        return { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
      if (e.changedTouches && e.changedTouches.length > 0) {
        return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
      }
      return { x: e.clientX, y: e.clientY };
    }

    function startDrag(e) {
      if (e.target && (e.target.closest('.tier-btn') || e.target.closest('.minimize-btn'))) return;
      if (isDragging) return;

      const coords = getCoords(e);
      if (coords.x === undefined || coords.y === undefined) return;

      if (e.cancelable) {
        e.preventDefault();
      }

      isDragging = true;
      hasDragged = false;
      container.classList.add('dragging');

      const rect = container.getBoundingClientRect();
      container.style.transform = 'none';
      container.style.bottom = 'auto';
      container.style.right = 'auto';
      container.style.left = `${rect.left}px`;
      container.style.top = `${rect.top}px`;

      dragStartX = coords.x;
      dragStartY = coords.y;
      elemStartX = rect.left;
      elemStartY = rect.top;

      if (e.pointerId !== undefined && typeof e.target.setPointerCapture === 'function') {
        activePointerId = e.pointerId;
        try {
          e.target.setPointerCapture(e.pointerId);
        } catch (err) {}
      }

      window.addEventListener('pointermove', onMove, { passive: false });
      window.addEventListener('pointerup', stopDrag);
      window.addEventListener('pointercancel', stopDrag);
      window.addEventListener('touchmove', onMove, { passive: false });
      window.addEventListener('touchend', stopDrag);
      window.addEventListener('touchcancel', stopDrag);
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', stopDrag);
    }

    function onMove(e) {
      if (!isDragging) return;
      const coords = getCoords(e);
      if (coords.x === undefined || coords.y === undefined) return;

      const deltaX = coords.x - dragStartX;
      const deltaY = coords.y - dragStartY;

      if (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4) {
        hasDragged = true;
      }

      if (e.cancelable) {
        e.preventDefault();
      }

      let newLeft = elemStartX + deltaX;
      let newTop = elemStartY + deltaY;

      const maxLeft = window.innerWidth - container.offsetWidth - 10;
      const maxTop = window.innerHeight - container.offsetHeight - 10;
      newLeft = Math.max(10, Math.min(newLeft, maxLeft));
      newTop = Math.max(10, Math.min(newTop, maxTop));

      container.style.left = `${newLeft}px`;
      container.style.top = `${newTop}px`;
    }

    function stopDrag(e) {
      if (!isDragging) return;
      isDragging = false;
      container.classList.remove('dragging');

      if (activePointerId !== null && e && e.target && typeof e.target.releasePointerCapture === 'function') {
        try {
          e.target.releasePointerCapture(activePointerId);
        } catch (err) {}
        activePointerId = null;
      }

      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', stopDrag);
      window.removeEventListener('pointercancel', stopDrag);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', stopDrag);
      window.removeEventListener('touchcancel', stopDrag);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', stopDrag);

      try {
        if (!chrome?.runtime?.id) return;
        const rect = container.getBoundingClientRect();
        const pos = { left: Math.round(rect.left), top: Math.round(rect.top) };

        chrome.storage.sync.set({ [WIDGET_POS_KEY]: pos });
        chrome.runtime.sendMessage({ action: 'saveWidgetPos', pos: pos }, () => {});
      } catch (err) {
        // Silently ignore if tab was not refreshed after extension reload
      }
    }

    const dragHandles = [header, t1Label, t2Label, t3Label, minPill];
    dragHandles.forEach((handle) => {
      handle.addEventListener('pointerdown', startDrag);
      handle.addEventListener('touchstart', startDrag, { passive: false });
      handle.addEventListener('mousedown', startDrag);
    });

    shadow.appendChild(style);
    shadow.appendChild(container);
  }
})();
