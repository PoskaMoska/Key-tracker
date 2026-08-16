(function () {
  'use strict';

  // ===== Утилиты для ленивого (нечёткого) поиска =====

  // Карта раскладки EN -> RU (на случай, если пользователь забыл переключить раскладку)
  const EN_TO_RU_LAYOUT = {
    q: 'й', w: 'ц', e: 'у', r: 'к', t: 'е', y: 'н', u: 'г', i: 'ш', o: 'щ', p: 'з',
    '[': 'х', ']': 'ъ',
    a: 'ф', s: 'ы', d: 'в', f: 'а', g: 'п', h: 'р', j: 'о', k: 'л', l: 'д',
    ';': 'ж', "'": 'э',
    z: 'я', x: 'ч', c: 'с', v: 'м', b: 'и', n: 'т', m: 'ь',
    ',': 'б', '.': 'ю', '/': '.',
    '`': 'ё',
  };

  // Карта раскладки RU -> EN (обратная)
  const RU_TO_EN_LAYOUT = {};
  Object.keys(EN_TO_RU_LAYOUT).forEach((k) => {
    RU_TO_EN_LAYOUT[EN_TO_RU_LAYOUT[k]] = k;
  });

  // Часто встречающиеся сокращения, которые нужно вычищать/нормализовать перед сравнением
  const ABBREVIATIONS = [
    /\bул(ица)?\.?/gi,
    /\bпр(оспект|осп|-?т)?\.?/gi,
    /\bпер(еулок|еул)?\.?/gi,
    /\bб(уль)?в(ар)?\.?/gi,
    /\bбульв(ар)?\.?/gi,
    /\bпл(ощадь|ощ)?\.?/gi,
    /\bш(оссе|осс)?\.?/gi,
    /\bдом\.?/gi,
    /\bд\./gi,
    /\bкорп(ус)?\.?/gi,
    /\bкв(артира)?\.?/gi,
    /\bстр(оение)?\.?/gi,
  ];

  // Перевести строку из EN раскладки в RU (если пользователь забыл переключить)
  function toRussianLayout(str) {
    let result = '';
    for (const ch of str) {
      const lower = ch.toLowerCase();
      if (EN_TO_RU_LAYOUT[lower]) {
        result += EN_TO_RU_LAYOUT[lower];
      } else {
        result += lower;
      }
    }
    return result;
  }

  // Перевести строку из RU раскладки в EN
  function toEnglishLayout(str) {
    let result = '';
    for (const ch of str) {
      const lower = ch.toLowerCase();
      if (RU_TO_EN_LAYOUT[lower]) {
        result += RU_TO_EN_LAYOUT[lower];
      } else {
        result += lower;
      }
    }
    return result;
  }

  // Нормализация: lower-case, ё->е, замена украинских букв на близкие, удаление пунктуации, сокращений
  function normalize(str) {
    if (!str) return '';
    let s = String(str).toLowerCase().trim();
    s = s.replace(/ё/g, 'е').replace(/э/g, 'е');
    // украинские буквы -> похожие русские (на случай если адрес написан на русском, а пользователь вводит украинскую)
    s = s.replace(/і/g, 'и').replace(/ї/g, 'и').replace(/є/g, 'е').replace(/ґ/g, 'г');
    // убрать сокращения
    ABBREVIATIONS.forEach((re) => {
      s = s.replace(re, ' ');
    });
    // оставить только буквы/цифры/пробелы
    s = s.replace(/[^\p{L}\p{N}\s]/gu, ' ');
    // схлопнуть пробелы
    s = s.replace(/\s+/g, ' ').trim();
    return s;
  }

  // Расстояние Левенштейна (с ранним выходом по maxDist для производительности)
  function levenshtein(a, b, maxDist) {
    if (a === b) return 0;
    const al = a.length;
    const bl = b.length;
    if (al === 0) return bl;
    if (bl === 0) return al;
    if (Math.abs(al - bl) > (maxDist != null ? maxDist : Infinity)) {
      return maxDist + 1;
    }

    let prev = new Array(bl + 1);
    let curr = new Array(bl + 1);
    for (let j = 0; j <= bl; j++) prev[j] = j;

    for (let i = 1; i <= al; i++) {
      curr[0] = i;
      let rowMin = curr[0];
      for (let j = 1; j <= bl; j++) {
        const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
        curr[j] = Math.min(
          curr[j - 1] + 1,
          prev[j] + 1,
          prev[j - 1] + cost
        );
        if (curr[j] < rowMin) rowMin = curr[j];
      }
      if (maxDist != null && rowMin > maxDist) {
        return maxDist + 1;
      }
      const tmp = prev;
      prev = curr;
      curr = tmp;
    }
    return prev[bl];
  }

  // Допустимое расстояние Левенштейна в зависимости от длины слова
  function allowedDistance(len) {
    if (len <= 3) return 0;       // слишком короткое — только точное
    if (len <= 5) return 1;       // 1 опечатка
    if (len <= 8) return 2;       // 2 опечатки
    return 3;                     // длинные слова — до 3 опечаток
  }

// Проверяет совпадение запроса с ОДНИМ токеном (словом) в тексте
  // Возвращает true если совпало
  function tokenMatches(token, textWord) {
    // Точное совпадение по началу
    if (textWord.startsWith(token) || token.startsWith(textWord)) return true;
    // Проверяем опечатку по Левенштейну
    const minLen = Math.min(token.length, textWord.length);
    const maxLen = Math.max(token.length, textWord.length);
    const allowed = allowedDistance(minLen);
    const d = levenshtein(token, textWord, allowed);
    if (d <= allowed) {
      const rel = d / Math.max(1, maxLen);
      // Для коротких слов (<=5) нужен почти точный матч (rel < 0.25)
      // Для остальных (>=6) — допускаем больше опечаток (rel < 0.35)
      const relThreshold = maxLen <= 5 ? 0.25 : 0.35;
      if (rel < relThreshold) return true;
    }
    return false;
  }

  // Главная функция: проверить совпадение запроса с адресом
  // Возвращает true если адрес совпадает с запросом
  function addressMatches(rawQuery, address) {
    const normQuery = normalize(rawQuery);
    const normAddress = normalize(address);
    if (!normQuery || !normAddress) return false;

    const queryTokens = normQuery.split(' ').filter(Boolean);
    const addressWords = normAddress.split(' ').filter(Boolean);

    // Берём только первые 3 слова адреса (название улицы, номер дома)
    const streetWords = addressWords.slice(0, 3);

    // Если запрос — одно короткое слово (<=4 буквы) — строгое начало слова
    if (queryTokens.length === 1 && queryTokens[0].length <= 4) {
      return streetWords.some(w => w.startsWith(queryTokens[0]));
    }

    // Если запрос — одно длинное слово (>4 букв) — fuzzy match
    if (queryTokens.length === 1 && queryTokens[0].length > 4) {
      // Проверяем точное начало
      if (streetWords.some(w => w.startsWith(queryTokens[0]))) return true;
      // Проверяем fuzzy (опечатка)
      for (const w of streetWords) {
        if (tokenMatches(queryTokens[0], w)) return true;
      }
      // Проверяем layout translation
      const translated = normalize(toRussianLayout(rawQuery));
      if (translated && translated !== normQuery) {
        if (streetWords.some(w => w.startsWith(translated))) return true;
        for (const w of streetWords) {
          if (tokenMatches(translated, w)) return true;
        }
      }
      return false;
    }

    // Если запрос — несколько слов — все токены должны совпадать
    for (const qt of queryTokens) {
      const found = streetWords.some(w => w.startsWith(qt) || tokenMatches(qt, w));
      if (!found) {
        const translated = normalize(toRussianLayout(qt));
        if (translated && translated !== qt && streetWords.some(w => w.startsWith(translated) || tokenMatches(translated, w))) {
          // ok — layout match
        } else {
          return false;
        }
      }
    }
    return true;
  }

  // matchScore обёртка для обратной совместимости с app.js
  function matchScore(rawQuery, rawText) {
    return addressMatches(rawQuery, rawText) ? 0 : -1;
  }

  // ===== Поиск по адресам/ТКД в активити "Доступ" =====

function init(config) {
        const {
          searchInput,
          resultsEl,
          zoneAccessData,
          formatAddress,
          formatTkdLineHtml,
          escapeHtml,
          setCurrentZoneNum,
          showZoneAccessView,
          getZoneDisplayName,
        } = config;

      let searchQuery = '';

    function filterAddressesBySearch() {
      const results = [];
      const rawQuery = searchQuery.trim();

      if (!rawQuery) return results;

      Object.keys(zoneAccessData).forEach((zoneNum) => {
        const addresses = zoneAccessData[zoneNum] || [];
        addresses.forEach((addr, addressIdx) => {
          const fullAddress = addr.address || '';
          const accessCode = String(addr.code || '').trim();

          const addressScore = matchScore(rawQuery, fullAddress);
          const codeScore = accessCode ? matchScore(rawQuery, accessCode) : -1;

          if (addr.tkdEntries && addr.tkdEntries.length > 0) {
            addr.tkdEntries.forEach((tkdEntry, tkdIdx) => {
              const tkdNumber = String(tkdEntry.tkd || '').trim();
              const entrance = String(tkdEntry.entrance || '').trim();
              const place = String(tkdEntry.place || '').trim();

              const tkdScore = tkdNumber ? matchScore(rawQuery, tkdNumber) : -1;
              const entranceScore = entrance ? matchScore(rawQuery, entrance) : -1;
              const placeScore = place ? matchScore(rawQuery, place) : -1;

              // собираем минимальный (лучший) score по всем полям
              const scores = [addressScore, codeScore, tkdScore, entranceScore, placeScore]
                .filter((s) => s >= 0);

              if (scores.length > 0) {
                const bestScore = Math.min(...scores);
                results.push({
                  zoneNum,
                  zoneName: getZoneDisplayName(zoneNum),
                  address: addr.address,
                  addressIdx,
                  tkdEntry: { tkd: tkdNumber, entrance, place, tkdIdx },
                  score: bestScore,
                });
              }
            });
          } else {
            const scores = [addressScore, codeScore].filter((s) => s >= 0);
            if (scores.length > 0) {
              const bestScore = Math.min(...scores);
              results.push({
                zoneNum,
                zoneName: getZoneDisplayName(zoneNum),
                address: addr.address,
                addressIdx,
                tkdEntry: null,
                score: bestScore,
              });
            }
          }
        });
      });

      // сортировка по релевантности (меньший score = лучше)
      results.sort((a, b) => a.score - b.score);

      return results;
    }

    function renderResults() {
      if (!resultsEl) return;

      const list = filterAddressesBySearch();
      resultsEl.innerHTML = '';

      if (!list.length) {
        resultsEl.innerHTML = '<p class="search-no-results">Ничего не найдено</p>';
        resultsEl.style.display = '';
        return;
      }

      const grouped = {};
      // сохраняем порядок: первый встреченный адрес определяет позицию (у нас уже отсортировано по score)
      list.forEach((item) => {
        const key = `${item.zoneNum}_${item.addressIdx}`;
        if (!grouped[key]) {
          grouped[key] = {
            zoneNum: item.zoneNum,
            zoneName: item.zoneName,
            addressIdx: item.addressIdx,
            tkdEntries: [],
            score: item.score,
          };
        } else {
          // обновим score если нашли лучше
          if (item.score < grouped[key].score) grouped[key].score = item.score;
        }
        if (item.tkdEntry) {
          grouped[key].tkdEntries.push(item.tkdEntry);
        }
      });

      // повторная сортировка после группировки
      const groupedList = Object.values(grouped).sort((a, b) => a.score - b.score);

      groupedList.forEach((item) => {
        const zoneNum = item.zoneNum;
        const addresses = zoneAccessData[zoneNum] || [];
        const addr = addresses[item.addressIdx] || {};
        const el = document.createElement('div');
        let tkdDetailsHtml = '';

        el.className = 'address-card search-result-address-card';
        el.style.cursor = 'pointer';

        if (item.tkdEntries.length > 0) {
          tkdDetailsHtml = `
            <div class="address-card__details" style="display: block;">
              <div class="address-card__tkd-list">
                ${item.tkdEntries.map((tkd, idx) => `
                  <div class="address-card__tkd-item">${formatTkdLineHtml(tkd.entrance, tkd.tkd, tkd.place)}</div>
                  ${idx < item.tkdEntries.length - 1 ? '<div class="address-card__tkd-separator"></div>' : ''}
                `).join('')}
              </div>
            </div>
          `;
        }

        // Build access items from code + notes (like getAddressAccessItems in app.js)
        const accessItems = [];
        const seen = new Set();
        const pushAccessItem = (val) => {
          const text = String(val || '').trim();
          if (!text) return;
          const norm = text.toLowerCase();
          if (seen.has(norm)) return;
          seen.add(norm);
          accessItems.push(text);
        };
        pushAccessItem(addr.code);
        if (Array.isArray(addr.notes)) {
          addr.notes.forEach((note) => pushAccessItem(note));
        }

        const accessHtml = accessItems.length
          ? accessItems.map((item) => `
              <div class="address-card__access-item address-card__phone" data-code="${escapeHtml(item)}">
                <span class="address-card__access-icon">🔑</span>
                <span class="address-card__access-text">${escapeHtml(item)}</span>
              </div>
            `).join('')
          : '';

        el.innerHTML = `
          <div class="address-card__header">
            <div class="address-card__info">
              <span class="address-card__pin">📍</span>
              <span class="address-card__street">${escapeHtml(formatAddress(addr.address))}</span>
              <span class="address-card__zone-label" style="font-size: 0.85em; color: #666; margin-left: 0.5em;">${escapeHtml(item.zoneName)}</span>
            </div>
            <div class="address-card__chips">
              ${addr.code ? `<div class="address-card__chip address-card__chip--code"><span class="address-card__chip-icon">🔑</span> Доступ: ${escapeHtml(addr.code)}</div>` : ''}
            </div>
            ${accessHtml ? `<div class="address-card__access">${accessHtml}</div>` : ''}
          </div>
          ${tkdDetailsHtml}
        `;

        resultsEl.appendChild(el);

        // Click-to-call on access items — direct per-element handler
        el.querySelectorAll('.address-card__phone').forEach((phoneEl) => {
          phoneEl.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const code = phoneEl.dataset.code || '';
            const digitsOnly = code.replace(/\D/g, '');
            if (digitsOnly.length >= 9) {
              if (confirm(`Позвонить по номеру ${digitsOnly}?`)) {
                window.location.href = `tel:${digitsOnly}`;
              }
            }
          });
        });
        el.querySelectorAll('.tkd-code').forEach((span) => {
          const text = span.textContent.trim();
          const digitsOnly = text.replace(/\D/g, '');
          if (digitsOnly.length >= 9) {
            span.style.cursor = 'pointer';
            span.addEventListener('click', (e) => {
              e.stopPropagation();
              if (confirm(`Позвонить по номеру ${digitsOnly}?`)) {
                window.location.href = `tel:${digitsOnly}`;
              }
            });
          }
        });
        // Click-to-call on code chip if it contains a phone number
        const codeChip = el.querySelector('.address-card__chip--code');
        if (codeChip) {
          const codeText = addr.code || '';
          const digitsOnly = codeText.replace(/\D/g, '');
          if (digitsOnly.length >= 9) {
            codeChip.style.cursor = 'pointer';
            codeChip.addEventListener('click', (e) => {
              e.stopPropagation();
              if (confirm(`Позвонить по номеру ${digitsOnly}?`)) {
                window.location.href = `tel:${digitsOnly}`;
              }
            });
          }
        }
      });

      resultsEl.style.display = '';
    }

    function resizeSearchInput() {
      if (!searchInput) return;

      const value = searchInput.value || searchInput.placeholder || '';
      const measure = document.createElement('span');
      const computed = window.getComputedStyle(searchInput);

      measure.style.position = 'absolute';
      measure.style.visibility = 'hidden';
      measure.style.whiteSpace = 'pre';
      measure.style.font = computed.font;
      measure.style.letterSpacing = computed.letterSpacing;
      measure.textContent = value;

      document.body.appendChild(measure);
      const nextWidth = Math.max(200, Math.ceil(measure.getBoundingClientRect().width + 28));
      document.body.removeChild(measure);

      searchInput.style.width = nextWidth + 'px';
    }

    function clear() {
      if (searchInput) {
        searchInput.value = '';
      }
      searchQuery = '';
      resizeSearchInput();
      if (resultsEl) {
        resultsEl.style.display = 'none';
      }
    }

    function bind() {
      if (!searchInput) return;

      resizeSearchInput();

      searchInput.addEventListener('input', () => {
        resizeSearchInput();
        searchQuery = searchInput.value;
        if (searchQuery.trim()) {
          renderResults();
        } else if (resultsEl) {
          resultsEl.style.display = 'none';
        }
      });

      searchInput.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          clear();
        }
      });
    }

    bind();

    return {
      clear,
      renderResults,
      resizeSearchInput,
    };
  }

  window.ZoneAccessSearch = {
    init,
  };
})();
