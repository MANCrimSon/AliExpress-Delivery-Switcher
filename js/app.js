/**
 * AliExpress Global Switcher - Popup Controller
 * @author svtcore (enhanced with independent starred favorites,
 * prioritized lists, search filters, and Ukrainian language support)
 * @license MIT
 * @link https://github.com/svtcore
 */

import {
  COUNTRIES,
  CURRENCIES,
  LOCALES,
  DEFAULT_SETTINGS,
  STORAGE_KEY,
  getCurrencySymbol,
  getLocaleShortLabel
} from './config.js';

/**
 * Localization dictionary for extension popup interface (RU, UA, EN)
 */
const UI_I18N = {
  ua: {
    langLabel: 'UA',
    btnTitle: 'Змінити мову інтерфейсу (UA / EN / RU)',
    headerSub: 'Обрані параметри та доставка',
    shipTo: 'Доставка (Ship To)',
    currency: 'Валюта (Currency)',
    language: 'Мова сайту (Language)',
    searchPlaceholder: 'Пошук...',
    favoritesTitle: '⭐ Обране:',
    btnApply: 'Застосувати обране до сайту',
    helpHint: 'Позначені зірочкою ⭐ країни, валюти та мови відображаються у незалежному 3-рівневому віджеті на AliExpress.',
    settingWidgetTitle: 'Віджет',
    settingWidgetDesc: 'Кнопки на товарах',
    settingGlobalTitle: 'Захист від .RU',
    settingGlobalDesc: 'Блокування редиректу на .ru',
    starAdd: 'Додати до обраного',
    starRemove: 'Прибрати з обраного',
    optFav: '⭐ Обране',
    optOtherCountries: 'Усі інші країни (за алфавітом)',
    optOtherCurrencies: 'Усі інші валюти (за алфавітом)',
    optOtherLocales: 'Усі інші мови (за алфавітом)',
    saved: 'Налаштування збережено',
    applying: 'Застосування параметрів...',
    applied: 'Параметри застосовано! Вкладку оновлено.'
  },
  en: {
    langLabel: 'EN',
    btnTitle: 'Change interface language (UA / EN / RU)',
    headerSub: 'Favorite settings & shipping',
    shipTo: 'Shipping (Ship To)',
    currency: 'Currency',
    language: 'Website Language',
    searchPlaceholder: 'Search...',
    favoritesTitle: '⭐ Favorites:',
    btnApply: 'Apply selected to website',
    helpHint: 'Starred ⭐ countries, currencies, and languages appear in the independent 3-tier widget on AliExpress pages.',
    settingWidgetTitle: 'Widget',
    settingWidgetDesc: 'On-page buttons',
    settingGlobalTitle: 'Anti-RU Shield',
    settingGlobalDesc: 'Block redirect to .ru',
    starAdd: 'Add to favorites',
    starRemove: 'Remove from favorites',
    optFav: '⭐ Favorites',
    optOtherCountries: 'All other countries (alphabetical)',
    optOtherCurrencies: 'All other currencies (alphabetical)',
    optOtherLocales: 'All other languages (alphabetical)',
    saved: 'Settings saved',
    applying: 'Applying settings...',
    applied: 'Settings applied! Tab refreshed.'
  },
  ru: {
    langLabel: 'RU',
    btnTitle: 'Сменить язык интерфейса (UA / EN / RU)',
    headerSub: 'Избранные параметры и доставка',
    shipTo: 'Доставка (Ship To)',
    currency: 'Валюта (Currency)',
    language: 'Язык сайта (Language)',
    searchPlaceholder: 'Поиск...',
    favoritesTitle: '⭐ Избранное:',
    btnApply: 'Применить выбранное к сайту',
    helpHint: 'Отмеченные звёздочкой ⭐ страны, валюты и языки выводятся в независимый 3-уровневый виджет на страницах AliExpress.',
    settingWidgetTitle: 'Виджет',
    settingWidgetDesc: 'Кнопки на товарах',
    settingGlobalTitle: 'Защита от .RU',
    settingGlobalDesc: 'Блокировка редиректа на .ru',
    starAdd: 'Добавить в избранное',
    starRemove: 'Убрать из избранного',
    optFav: '⭐ Избранное',
    optOtherCountries: 'Все остальные страны (по алфавиту)',
    optOtherCurrencies: 'Все остальные валюты (по алфавиту)',
    optOtherLocales: 'Все остальные языки (по алфавиту)',
    saved: 'Настройки сохранены',
    applying: 'Применение параметров...',
    applied: 'Параметры применены! Вкладка обновлена.'
  }
};

/**
 * Controls the extension popup UI: loads/saves settings,
 * manages independent starred favorites for countries, currencies, and languages,
 * populates searchable dropdowns with dynamic "⭐ Избранное" at top, and applies selections.
 */
class PopupController {

  /** DOM element references (resolved in #cacheElements). */
  #els = {};

  /** Current loaded settings object */
  #settings = null;

  /** Current popup UI language ('ua', 'en', 'ru') */
  #currentUiLang = 'ua';

  constructor() {
    document.addEventListener('DOMContentLoaded', () => this.#init());
  }

  // Initialisation

  #init() {
    this.#cacheElements();
    this.#displayExtensionVersion();
    this.#populateDropdowns();
    this.#loadSettings();
    this.#bindEvents();
  }

  #displayExtensionVersion() {
    try {
      const manifest = chrome.runtime?.getManifest?.();
      if (manifest?.version && this.#els.extVersion) {
        this.#els.extVersion.textContent = `v${manifest.version}`;
        this.#els.extVersion.title = `Version ${manifest.version}`;
      }
    } catch (e) {}
  }

  #cacheElements() {
    this.#els = {
      globalMode:           document.getElementById('global_mode'),
      showWidget:           document.getElementById('show_widget'),
      countries:            document.getElementById('countries'),
      currencies:           document.getElementById('currencies'),
      locales:              document.getElementById('locales'),
      starCountry:          document.getElementById('star_country'),
      starCurrency:         document.getElementById('star_currency'),
      starLocale:           document.getElementById('star_locale'),
      favCountriesChips:    document.getElementById('fav_countries_chips'),
      favCurrenciesChips:   document.getElementById('fav_currencies_chips'),
      favLocalesChips:      document.getElementById('fav_locales_chips'),
      searchCountry:        document.getElementById('search_country'),
      searchCurrency:       document.getElementById('search_currency'),
      searchLocale:         document.getElementById('search_locale'),
      clearBtns:            document.querySelectorAll('.search-clear'),
      btnApply:             document.getElementById('btn_apply'),
      message:              document.getElementById('message'),
      github:               document.getElementById('github'),
      extVersion:           document.getElementById('ext_version'),
      uiLangBtn:            document.getElementById('ui_lang_btn'),
      uiLangLabel:          document.getElementById('ui_lang_label'),
      uiHeaderSub:          document.getElementById('ui_header_sub'),
      uiLabelCountry:       document.getElementById('ui_label_country'),
      uiFavTitleCountry:    document.getElementById('ui_fav_title_country'),
      uiLabelCurrency:      document.getElementById('ui_label_currency'),
      uiFavTitleCurrency:   document.getElementById('ui_fav_title_currency'),
      uiLabelLocale:        document.getElementById('ui_label_locale'),
      uiFavTitleLocale:     document.getElementById('ui_fav_title_locale'),
      uiBtnApply:           document.getElementById('ui_btn_apply'),
      uiHelpHint:           document.getElementById('ui_help_hint'),
      uiSettingWidgetTitle: document.getElementById('ui_setting_widget_title'),
      uiSettingWidgetDesc:  document.getElementById('ui_setting_widget_desc'),
      uiSettingGlobalTitle: document.getElementById('ui_setting_global_title'),
      uiSettingGlobalDesc:  document.getElementById('ui_setting_global_desc')
    };
  }

  // UI Localization Handler

  #applyUiTranslations() {
    const t = UI_I18N[this.#currentUiLang] || UI_I18N.ua;

    if (this.#els.uiLangLabel) this.#els.uiLangLabel.textContent = t.langLabel;
    if (this.#els.uiLangBtn) this.#els.uiLangBtn.title = t.btnTitle;
    if (this.#els.uiHeaderSub) this.#els.uiHeaderSub.textContent = t.headerSub;
    if (this.#els.uiLabelCountry) this.#els.uiLabelCountry.textContent = t.shipTo;
    if (this.#els.uiFavTitleCountry) this.#els.uiFavTitleCountry.textContent = t.favoritesTitle;
    if (this.#els.uiLabelCurrency) this.#els.uiLabelCurrency.textContent = t.currency;
    if (this.#els.uiFavTitleCurrency) this.#els.uiFavTitleCurrency.textContent = t.favoritesTitle;
    if (this.#els.uiLabelLocale) this.#els.uiLabelLocale.textContent = t.language;
    if (this.#els.uiFavTitleLocale) this.#els.uiFavTitleLocale.textContent = t.favoritesTitle;
    if (this.#els.uiBtnApply) this.#els.uiBtnApply.textContent = t.btnApply;
    if (this.#els.uiHelpHint) this.#els.uiHelpHint.textContent = t.helpHint;
    if (this.#els.uiSettingWidgetTitle) this.#els.uiSettingWidgetTitle.textContent = t.settingWidgetTitle;
    if (this.#els.uiSettingWidgetDesc) this.#els.uiSettingWidgetDesc.textContent = t.settingWidgetDesc;
    if (this.#els.uiSettingGlobalTitle) this.#els.uiSettingGlobalTitle.textContent = t.settingGlobalTitle;
    if (this.#els.uiSettingGlobalDesc) this.#els.uiSettingGlobalDesc.textContent = t.settingGlobalDesc;

    if (this.#els.searchCountry) this.#els.searchCountry.placeholder = t.searchPlaceholder;
    if (this.#els.searchCurrency) this.#els.searchCurrency.placeholder = t.searchPlaceholder;
    if (this.#els.searchLocale) this.#els.searchLocale.placeholder = t.searchPlaceholder;

    this.#populateDropdowns();
    this.#updateAllStarStates();
  }

  #cycleUiLanguage() {
    const langs = ['ua', 'en', 'ru'];
    const idx = langs.indexOf(this.#currentUiLang);
    this.#currentUiLang = langs[(idx + 1) % langs.length];
    if (this.#settings) {
      this.#settings.uiLang = this.#currentUiLang;
      this.#saveSettings(false);
    }
    this.#applyUiTranslations();
  }

  // Dropdown population with Dynamic Favorites (⭐ Избранное) & Live Filtering

  #populateDropdowns() {
    this.#populateCountries(this.#els.searchCountry ? this.#els.searchCountry.value : '');
    this.#populateCurrencies(this.#els.searchCurrency ? this.#els.searchCurrency.value : '');
    this.#populateLocales(this.#els.searchLocale ? this.#els.searchLocale.value : '');
  }

  #formatCountryLabel(code) {
    const raw = COUNTRIES[code] || code.toUpperCase();
    return `${raw} (${code.toUpperCase()})`;
  }

  #formatCurrencyLabel(code) {
    const raw = CURRENCIES[code] || code;
    const name = raw.includes(' - ') ? raw.split(' - ').slice(1).join(' - ').trim() : raw;
    const symbol = getCurrencySymbol(code);
    if (symbol && symbol !== code) {
      return `${symbol} ${code} - ${name}`;
    }
    return `${code} - ${name}`;
  }

  #formatLocaleLabel(code) {
    const raw = LOCALES[code] || code;
    const short = getLocaleShortLabel(code);
    return `${raw} (${short})`;
  }

  /**
   * Populate countries select:
   * 1. Dynamic "⭐ Избранное" from favoriteCountries
   * 2. All other countries sorted alphabetically
   * Supports search filter
   */
  #populateCountries(filter = '') {
    const select = this.#els.countries;
    const currentVal = select.value;
    select.innerHTML = '';

    const t = UI_I18N[this.#currentUiLang] || UI_I18N.ua;
    const query = filter.trim().toLowerCase();
    const favCodes = (this.#settings && Array.isArray(this.#settings.favoriteCountries))
      ? this.#settings.favoriteCountries
      : DEFAULT_SETTINGS.favoriteCountries;

    const favoriteItems = favCodes.filter((code) => COUNTRIES[code]).map((code) => ({
      code,
      label: this.#formatCountryLabel(code),
      rawName: COUNTRIES[code]
    }));

    const otherCodes = Object.keys(COUNTRIES)
      .filter((code) => !favCodes.includes(code))
      .sort((a, b) => COUNTRIES[a].localeCompare(COUNTRIES[b]));

    const otherItems = otherCodes.map((code) => ({
      code,
      label: this.#formatCountryLabel(code),
      rawName: COUNTRIES[code]
    }));

    if (query) {
      const allItems = [...favoriteItems, ...otherItems].filter((item) =>
        item.rawName.toLowerCase().includes(query) || item.code.toLowerCase().includes(query)
      );

      if (allItems.length === 0) {
        const opt = document.createElement('option');
        opt.disabled = true;
        opt.textContent = '---';
        select.appendChild(opt);
      } else {
        allItems.forEach((item) => {
          const opt = document.createElement('option');
          opt.value = item.code;
          opt.textContent = item.label;
          select.appendChild(opt);
        });
      }
    } else {
      if (favoriteItems.length > 0) {
        const groupFav = document.createElement('optgroup');
        groupFav.label = t.optFav;
        favoriteItems.forEach((item) => {
          const opt = document.createElement('option');
          opt.value = item.code;
          opt.textContent = item.label;
          groupFav.appendChild(opt);
        });
        select.appendChild(groupFav);
      }

      const groupOthers = document.createElement('optgroup');
      groupOthers.label = t.optOtherCountries;
      otherItems.forEach((item) => {
        const opt = document.createElement('option');
        opt.value = item.code;
        opt.textContent = item.label;
        groupOthers.appendChild(opt);
      });
      select.appendChild(groupOthers);
    }

    if (currentVal && select.querySelector(`option[value="${currentVal}"]`)) {
      select.value = currentVal;
    }
  }

  /**
   * Populate currencies select:
   * 1. Dynamic "⭐ Избранное" from favoriteCurrencies
   * 2. All other currencies sorted alphabetically
   * Supports search filter
   */
  #populateCurrencies(filter = '') {
    const select = this.#els.currencies;
    const currentVal = select.value;
    select.innerHTML = '';

    const t = UI_I18N[this.#currentUiLang] || UI_I18N.ua;
    const query = filter.trim().toLowerCase();
    const favCodes = (this.#settings && Array.isArray(this.#settings.favoriteCurrencies))
      ? this.#settings.favoriteCurrencies
      : DEFAULT_SETTINGS.favoriteCurrencies;

    const favoriteItems = favCodes.filter((code) => CURRENCIES[code]).map((code) => ({
      code,
      label: this.#formatCurrencyLabel(code),
      rawName: CURRENCIES[code]
    }));

    const otherCodes = Object.keys(CURRENCIES)
      .filter((code) => !favCodes.includes(code))
      .sort((a, b) => CURRENCIES[a].localeCompare(CURRENCIES[b]));

    const otherItems = otherCodes.map((code) => ({
      code,
      label: this.#formatCurrencyLabel(code),
      rawName: CURRENCIES[code]
    }));

    if (query) {
      const allItems = [...favoriteItems, ...otherItems].filter((item) =>
        item.rawName.toLowerCase().includes(query) || item.code.toLowerCase().includes(query)
      );

      if (allItems.length === 0) {
        const opt = document.createElement('option');
        opt.disabled = true;
        opt.textContent = '---';
        select.appendChild(opt);
      } else {
        allItems.forEach((item) => {
          const opt = document.createElement('option');
          opt.value = item.code;
          opt.textContent = item.label;
          select.appendChild(opt);
        });
      }
    } else {
      if (favoriteItems.length > 0) {
        const groupFav = document.createElement('optgroup');
        groupFav.label = t.optFav;
        favoriteItems.forEach((item) => {
          const opt = document.createElement('option');
          opt.value = item.code;
          opt.textContent = item.label;
          groupFav.appendChild(opt);
        });
        select.appendChild(groupFav);
      }

      const groupOthers = document.createElement('optgroup');
      groupOthers.label = t.optOtherCurrencies;
      otherItems.forEach((item) => {
        const opt = document.createElement('option');
        opt.value = item.code;
        opt.textContent = item.label;
        groupOthers.appendChild(opt);
      });
      select.appendChild(groupOthers);
    }

    if (currentVal && select.querySelector(`option[value="${currentVal}"]`)) {
      select.value = currentVal;
    }
  }

  /**
   * Populate locales select:
   * 1. Dynamic "⭐ Избранное" from favoriteLocales
   * 2. All other locales sorted alphabetically
   * Supports search filter
   */
  #populateLocales(filter = '') {
    const select = this.#els.locales;
    const currentVal = select.value;
    select.innerHTML = '';

    const t = UI_I18N[this.#currentUiLang] || UI_I18N.ua;
    const query = filter.trim().toLowerCase();
    const favCodes = (this.#settings && Array.isArray(this.#settings.favoriteLocales))
      ? this.#settings.favoriteLocales
      : DEFAULT_SETTINGS.favoriteLocales;

    const favoriteItems = favCodes.filter((code) => LOCALES[code]).map((code) => ({
      code,
      label: this.#formatLocaleLabel(code),
      rawName: LOCALES[code]
    }));

    const otherCodes = Object.keys(LOCALES)
      .filter((code) => !favCodes.includes(code))
      .sort((a, b) => LOCALES[a].localeCompare(LOCALES[b]));

    const otherItems = otherCodes.map((code) => ({
      code,
      label: this.#formatLocaleLabel(code),
      rawName: LOCALES[code]
    }));

    if (query) {
      const allItems = [...favoriteItems, ...otherItems].filter((item) =>
        item.rawName.toLowerCase().includes(query) || item.code.toLowerCase().includes(query)
      );

      if (allItems.length === 0) {
        const opt = document.createElement('option');
        opt.disabled = true;
        opt.textContent = '---';
        select.appendChild(opt);
      } else {
        allItems.forEach((item) => {
          const opt = document.createElement('option');
          opt.value = item.code;
          opt.textContent = item.label;
          select.appendChild(opt);
        });
      }
    } else {
      if (favoriteItems.length > 0) {
        const groupFav = document.createElement('optgroup');
        groupFav.label = t.optFav;
        favoriteItems.forEach((item) => {
          const opt = document.createElement('option');
          opt.value = item.code;
          opt.textContent = item.label;
          groupFav.appendChild(opt);
        });
        select.appendChild(groupFav);
      }

      const groupOthers = document.createElement('optgroup');
      groupOthers.label = t.optOtherLocales;
      otherItems.forEach((item) => {
        const opt = document.createElement('option');
        opt.value = item.code;
        opt.textContent = item.label;
        groupOthers.appendChild(opt);
      });
      select.appendChild(groupOthers);
    }

    if (currentVal && select.querySelector(`option[value="${currentVal}"]`)) {
      select.value = currentVal;
    }
  }

  // Settings persistence

  #loadSettings() {
    chrome.storage.sync.get(STORAGE_KEY, (result) => {
      try {
        this.#settings = result[STORAGE_KEY]
          ? JSON.parse(result[STORAGE_KEY])
          : { ...DEFAULT_SETTINGS };
      } catch {
        this.#settings = { ...DEFAULT_SETTINGS };
      }

      // Restore UI language
      if (this.#settings.uiLang && UI_I18N[this.#settings.uiLang]) {
        this.#currentUiLang = this.#settings.uiLang;
      }

      // Ensure favorites arrays are initialized
      if (!Array.isArray(this.#settings.favoriteCountries) || !this.#settings.favoriteCountries.length) {
        this.#settings.favoriteCountries = [...DEFAULT_SETTINGS.favoriteCountries];
      }
      if (!Array.isArray(this.#settings.favoriteCurrencies) || !this.#settings.favoriteCurrencies.length) {
        this.#settings.favoriteCurrencies = [...DEFAULT_SETTINGS.favoriteCurrencies];
      }
      if (!Array.isArray(this.#settings.favoriteLocales) || !this.#settings.favoriteLocales.length) {
        this.#settings.favoriteLocales = [...DEFAULT_SETTINGS.favoriteLocales];
      }

      this.#applyUiTranslations();

      this.#els.globalMode.checked = !!this.#settings.globalMode;
      this.#els.showWidget.checked = this.#settings.showOnPageWidget !== false;
      this.#els.countries.value    = this.#settings.region   || 'ua';
      this.#els.currencies.value   = this.#settings.currency || 'EUR';
      this.#els.locales.value      = this.#settings.locale   || 'ru_RU';

      this.#renderAllFavoriteChips();
      this.#updateAllStarStates();
    });
  }

  #saveSettings(showMsg = true) {
    const t = UI_I18N[this.#currentUiLang] || UI_I18N.ua;
    this.#settings.currency         = this.#els.currencies.value;
    this.#settings.region           = this.#els.countries.value;
    this.#settings.locale           = this.#els.locales.value;
    this.#settings.uiLang           = this.#currentUiLang;
    this.#settings.site             = 'glo';
    this.#settings.globalMode       = this.#els.globalMode.checked;
    this.#settings.showOnPageWidget = this.#els.showWidget.checked;
    this.#settings.applySettings    = false;

    chrome.storage.sync.set(
      { [STORAGE_KEY]: JSON.stringify(this.#settings) },
      () => {
        if (showMsg) this.#showMessage(t.saved);
      }
    );
  }

  // Starred Favorites Management

  #updateStarState(category) {
    if (!this.#settings) return;
    const t = UI_I18N[this.#currentUiLang] || UI_I18N.ua;

    if (category === 'country') {
      const val = (this.#els.countries.value || '').toLowerCase();
      const isFav = this.#settings.favoriteCountries.includes(val);
      this.#els.starCountry.classList.toggle('is-favorite', isFav);
      this.#els.starCountry.title = isFav ? t.starRemove : t.starAdd;
    } else if (category === 'currency') {
      const val = (this.#els.currencies.value || '').toUpperCase();
      const isFav = this.#settings.favoriteCurrencies.includes(val);
      this.#els.starCurrency.classList.toggle('is-favorite', isFav);
      this.#els.starCurrency.title = isFav ? t.starRemove : t.starAdd;
    } else if (category === 'locale') {
      const val = this.#els.locales.value || '';
      const isFav = this.#settings.favoriteLocales.includes(val);
      this.#els.starLocale.classList.toggle('is-favorite', isFav);
      this.#els.starLocale.title = isFav ? t.starRemove : t.starAdd;
    }
  }

  #updateAllStarStates() {
    this.#updateStarState('country');
    this.#updateStarState('currency');
    this.#updateStarState('locale');
  }

  #toggleFavorite(category, value) {
    if (!this.#settings) return;

    let array;
    let label;

    if (category === 'country') {
      const code = value.toLowerCase();
      array = this.#settings.favoriteCountries;
      const idx = array.indexOf(code);
      if (idx !== -1) {
        array.splice(idx, 1);
        label = `Страна ${code.toUpperCase()} удалена`;
      } else {
        array.push(code);
        label = `Страна ${code.toUpperCase()} добавлена ⭐`;
      }
      this.#populateCountries(this.#els.searchCountry.value);
      this.#renderFavoriteChips('country');
      this.#updateStarState('country');
    } else if (category === 'currency') {
      const code = value.toUpperCase();
      array = this.#settings.favoriteCurrencies;
      const idx = array.indexOf(code);
      if (idx !== -1) {
        array.splice(idx, 1);
        label = `Валюта ${code} удалена`;
      } else {
        array.push(code);
        label = `Валюта ${code} добавлена ⭐`;
      }
      this.#populateCurrencies(this.#els.searchCurrency.value);
      this.#renderFavoriteChips('currency');
      this.#updateStarState('currency');
    } else if (category === 'locale') {
      const code = value;
      array = this.#settings.favoriteLocales;
      const idx = array.indexOf(code);
      if (idx !== -1) {
        array.splice(idx, 1);
        label = `Язык ${getLocaleShortLabel(code)} удален`;
      } else {
        array.push(code);
        label = `Язык ${getLocaleShortLabel(code)} добавлен ⭐`;
      }
      this.#populateLocales(this.#els.searchLocale.value);
      this.#renderFavoriteChips('locale');
      this.#updateStarState('locale');
    }

    this.#saveSettings(false);
    this.#showMessage(label);
  }

  #renderFavoriteChips(category) {
    if (!this.#settings) return;

    if (category === 'country') {
      const container = this.#els.favCountriesChips;
      container.innerHTML = '';
      const current = (this.#els.countries.value || '').toLowerCase();

      this.#settings.favoriteCountries.forEach((code) => {
        const chip = document.createElement('div');
        const isActive = code === current;
        chip.className = `fav-chip ${isActive ? 'active' : ''}`;
        chip.title = COUNTRIES[code] || code.toUpperCase();
        chip.innerHTML = `
          <span>${code.toUpperCase()}</span>
          <span class="fav-chip-remove" title="×">&times;</span>
        `;

        chip.addEventListener('click', (e) => {
          if (e.target.closest('.fav-chip-remove')) {
            e.stopPropagation();
            this.#toggleFavorite('country', code);
          } else {
            this.#els.countries.value = code;
            this.#renderAllFavoriteChips();
            this.#updateStarState('country');
          }
        });

        container.appendChild(chip);
      });
    } else if (category === 'currency') {
      const container = this.#els.favCurrenciesChips;
      container.innerHTML = '';
      const current = (this.#els.currencies.value || '').toUpperCase();

      this.#settings.favoriteCurrencies.forEach((code) => {
        const chip = document.createElement('div');
        const isActive = code === current;
        chip.className = `fav-chip ${isActive ? 'active' : ''}`;
        chip.title = CURRENCIES[code] || code;
        const symbol = getCurrencySymbol(code);
        const chipLabel = (symbol && symbol !== code) ? `${symbol} ${code}` : code;
        chip.innerHTML = `
          <span>${chipLabel}</span>
          <span class="fav-chip-remove" title="×">&times;</span>
        `;

        chip.addEventListener('click', (e) => {
          if (e.target.closest('.fav-chip-remove')) {
            e.stopPropagation();
            this.#toggleFavorite('currency', code);
          } else {
            this.#els.currencies.value = code;
            this.#renderAllFavoriteChips();
            this.#updateStarState('currency');
          }
        });

        container.appendChild(chip);
      });
    } else if (category === 'locale') {
      const container = this.#els.favLocalesChips;
      container.innerHTML = '';
      const current = this.#els.locales.value || '';

      this.#settings.favoriteLocales.forEach((code) => {
        const chip = document.createElement('div');
        const isActive = code === current;
        chip.className = `fav-chip ${isActive ? 'active' : ''}`;
        chip.title = LOCALES[code] || code;
        chip.innerHTML = `
          <span>${getLocaleShortLabel(code)}</span>
          <span class="fav-chip-remove" title="×">&times;</span>
        `;

        chip.addEventListener('click', (e) => {
          if (e.target.closest('.fav-chip-remove')) {
            e.stopPropagation();
            this.#toggleFavorite('locale', code);
          } else {
            this.#els.locales.value = code;
            this.#renderAllFavoriteChips();
            this.#updateStarState('locale');
          }
        });

        container.appendChild(chip);
      });
    }
  }

  #renderAllFavoriteChips() {
    this.#renderFavoriteChips('country');
    this.#renderFavoriteChips('currency');
    this.#renderFavoriteChips('locale');
  }

  // Event binding

  #bindEvents() {
    // UI Language switch button
    if (this.#els.uiLangBtn) {
      this.#els.uiLangBtn.addEventListener('click', () => {
        this.#cycleUiLanguage();
      });
    }

    // Toggles
    this.#els.globalMode.addEventListener('change', () => this.#saveSettings());
    this.#els.showWidget.addEventListener('change', () => this.#saveSettings());

    // Search filters
    this.#els.searchCountry.addEventListener('input', (e) => {
      this.#onSearchInput(e.target, () => this.#populateCountries(e.target.value));
    });

    this.#els.searchCurrency.addEventListener('input', (e) => {
      this.#onSearchInput(e.target, () => this.#populateCurrencies(e.target.value));
    });

    this.#els.searchLocale.addEventListener('input', (e) => {
      this.#onSearchInput(e.target, () => this.#populateLocales(e.target.value));
    });

    // Clear search buttons
    this.#els.clearBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetId = btn.dataset.target;
        const input = document.getElementById(targetId);
        if (input) {
          input.value = '';
          input.closest('.search-box').classList.remove('has-value');
          if (targetId === 'search_country') this.#populateCountries('');
          if (targetId === 'search_currency') this.#populateCurrencies('');
          if (targetId === 'search_locale') this.#populateLocales('');
        }
      });
    });

    // Star toggle button clicks
    this.#els.starCountry.addEventListener('click', () => {
      this.#toggleFavorite('country', this.#els.countries.value);
    });

    this.#els.starCurrency.addEventListener('click', () => {
      this.#toggleFavorite('currency', this.#els.currencies.value);
    });

    this.#els.starLocale.addEventListener('click', () => {
      this.#toggleFavorite('locale', this.#els.locales.value);
    });

    // Dropdown change handlers
    this.#els.countries.addEventListener('change', () => {
      this.#updateStarState('country');
      this.#renderFavoriteChips('country');
    });

    this.#els.currencies.addEventListener('change', () => {
      this.#updateStarState('currency');
      this.#renderFavoriteChips('currency');
    });

    this.#els.locales.addEventListener('change', () => {
      this.#updateStarState('locale');
      this.#renderFavoriteChips('locale');
    });

    // "Применить выбранное к сайту" button
    this.#els.btnApply.addEventListener('click', () => {
      this.#onApplyCustom();
    });

    // GitHub link in footer
    this.#els.github.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: 'https://github.com/MANCrimSon/AliExpress-Delivery-Switcher' });
    });

    // Version badge in footer opens latest release
    if (this.#els.extVersion) {
      this.#els.extVersion.style.cursor = 'pointer';
      this.#els.extVersion.addEventListener('click', (e) => {
        e.preventDefault();
        chrome.tabs.create({ url: 'https://github.com/MANCrimSon/AliExpress-Delivery-Switcher/releases/latest' });
      });
    }
  }

  #onSearchInput(input, populateFn) {
    const box = input.closest('.search-box');
    if (input.value.trim()) {
      box.classList.add('has-value');
    } else {
      box.classList.remove('has-value');
    }
    populateFn();
  }

  /**
   * "Применить выбранное к сайту" button handler
   */
  #onApplyCustom() {
    const t = UI_I18N[this.#currentUiLang] || UI_I18N.ua;
    const region = this.#els.countries.value;
    const currency = this.#els.currencies.value;
    const locale = this.#els.locales.value;

    this.#settings.region = region;
    this.#settings.currency = currency;
    this.#settings.locale = locale;
    this.#saveSettings(false);

    this.#showMessage(t.applying);

    chrome.runtime.sendMessage(
      {
        action: 'applyCustom',
        region: region,
        currency: currency,
        locale: locale
      },
      () => {
        this.#renderAllFavoriteChips();
        this.#showMessage(t.applied);
      }
    );
  }

  // UI helpers

  #showMessage(text) {
    this.#els.message.textContent = text;
    setTimeout(() => {
      if (this.#els.message.textContent === text) {
        this.#els.message.textContent = '';
      }
    }, 3000);
  }
}

// Bootstrap
new PopupController();