;(function () {
  'use strict';

  const KNOWN_ACCESS_TERMS = [
    'подъезд', 'подьезд', 'підїзд', "під'їзд",
    'квартира', 'квартир', 'кв',
    'этаж', 'етаж', 'поверх',
    'домофон', 'кодов', 'парадн', 'парадное',
    'калитка', 'калиточка', 'ворот', 'вход', 'дверь',
    'вахтер', 'охран', 'консьерж',
    'диспетчер', 'осбб', 'жэк', 'жек',
    'код', 'пароль', 'доступ', 'ключ',
    'замок', 'видео', 'домофонн',
  ];

  function smartParseVoice(text) {
    const textCleaner = window.VoiceTextCleaner;
    const fuzzyMatcher = window.VoiceFuzzyMatcher;
    const numberParser = window.VoiceNumberParser;
    const accessMarkers = window.VoiceAccessMarkers;

    const { levenshtein } = fuzzyMatcher || {};
    const { replaceNumberWords, ORDINAL_WORD_FORMS } = numberParser || {};
    const {
      ACCESS_DESCRIPTION_MARKERS,
      LEADING_NOISE_WORDS,
      ENTRANCE_MARKERS,
      GATE_MARKERS,
      STATE_MARKERS,
      KEY_LOCATION_MARKERS,
      OSBB_MARKERS,
      STREET_PREFIXES,
      REQUEST_WORDS,
      isNoiseWord,
      looksLikeStreetName,
      isFollowedByEntrance,
      isPrecededByEntrance,
      looksLikeNumber,
    } = accessMarkers || {};

    if (textCleaner) text = textCleaner.cleanNoise(text);
    text = text.replace(/,/g, ' ').trim();

    function fuzzyMatch(a, b, maxDist) {
      if (!levenshtein) return a === b;
      if (a === b) return true;
      const aLow = a.toLowerCase();
      const bLow = b.toLowerCase();
      if (aLow === bLow) return true;
      if (aLow.startsWith(bLow) || bLow.startsWith(aLow)) return true;
      if (levenshtein(aLow, bLow) <= (maxDist || 2)) return true;
      return false;
    }

    function fixWord(token) {
      const low = token.toLowerCase();
      for (const known of KNOWN_ACCESS_TERMS) {
        if (fuzzyMatch(low, known, 2)) return known;
      }
      return token;
    }

    function fixNumberWord(token) {
      if (!numberParser || !numberParser.NUM_WORDS) return token;
      const low = token.toLowerCase();
      if (numberParser.NUM_WORDS[low] !== undefined) {
        return String(numberParser.NUM_WORDS[low]);
      }
      return token;
    }

    function fixText(input) {
      const tokens = input.split(/\s+/);
      return tokens.map(token => {
        let fixed = fixWord(token);
        fixed = fixNumberWord(fixed);
        fixed = fixSlurredWord(fixed);
        return fixed;
      }).join(' ');
    }

    function fixSlurredWord(token) {
      if (!levenshtein) return token;
      const low = token.toLowerCase();
      if (/^[а-яёіїєa-z]{3,20}$/.test(low)) {
        for (const known of KNOWN_ACCESS_TERMS) {
          if (levenshtein(low, known) <= 2) return known;
        }
      }
      if (numberParser) {
        const numberWord = numberParser.replaceNumberWords(token);
        const onlyNumbers = numberWord.replace(/\D/g, '');
        if (onlyNumbers.length > 0 && onlyNumbers.length <= 6) {
          return onlyNumbers;
        }
      }
      return token;
    }

    text = fixText(text);
    const words = text.split(/\s+/);
    const numberPositions = [];

    for (let i = 0; i < words.length; i++) {
      if (looksLikeNumber && looksLikeNumber(words[i])) {
        numberPositions.push(i);
      }
    }

    let houseNumberPos = -1;
    let houseNumber = '';
    let address = '';
    let accessParts = [];

    if (numberPositions.length === 0) {
      let candidateStreet = words.filter(w => {
        const lower = w.toLowerCase();
        if (isNoiseWord && isNoiseWord(lower)) return false;
        if (REQUEST_WORDS && REQUEST_WORDS.some(n => lower === n)) return false;
        if (ENTRANCE_MARKERS && ENTRANCE_MARKERS.test(lower)) return false;
        if (GATE_MARKERS && GATE_MARKERS.some(m => lower.includes(m))) return false;
        if (!/[а-яёіїєА-ЯЁЇІЄa-zA-Z]/.test(w)) return false;
        return true;
      }).join(' ');

      if (candidateStreet.length >= 3) {
        const normalizedStreet = candidateStreet.toLowerCase();
        const streetHasAccessMarker = ACCESS_DESCRIPTION_MARKERS && ACCESS_DESCRIPTION_MARKERS.some(m => normalizedStreet.includes(m));
        if (!streetHasAccessMarker) {
          address = candidateStreet;
        }
      }
    } else if (numberPositions.length === 1) {
      houseNumberPos = numberPositions[0];
      houseNumber = words[houseNumberPos];
    } else {
      const firstNumIdx = numberPositions[0];
      const nextWordIdx = firstNumIdx + 1;

      if (nextWordIdx < words.length && ENTRANCE_MARKERS && ENTRANCE_MARKERS.test(words[nextWordIdx])) {
        if (firstNumIdx > 0 && looksLikeStreetName && looksLikeStreetName(words[firstNumIdx - 1])) {
          houseNumberPos = firstNumIdx;
          houseNumber = words[firstNumIdx];
        }
      }

      if (houseNumberPos === -1) {
        for (const pos of numberPositions) {
          if (pos === 0) continue;
          if (isFollowedByEntrance && isFollowedByEntrance(pos, words)) continue;

          const prevWord = words[pos - 1];
          if (looksLikeStreetName && looksLikeStreetName(prevWord)) {
            houseNumberPos = pos;
            const allNumbers = [];
            for (let j = pos; j < words.length; j++) {
              if (/^\d{1,4}[\а-яёіїє]?$/i.test(words[j])) {
                allNumbers.push(words[j]);
              } else {
                break;
              }
            }
            const hasCommaInText = /,\s*\d/.test(text);
            houseNumber = allNumbers.join(hasCommaInText ? ', ' : ' ');
            break;
          }
        }
      }

      if (houseNumberPos === -1) {
        for (let i = numberPositions.length - 1; i >= 0; i--) {
          const pos = numberPositions[i];
          if (!isFollowedByEntrance || !isFollowedByEntrance(pos, words)) {
            houseNumberPos = pos;
            houseNumber = words[pos];
            break;
          }
        }
      }
    }

    if (houseNumberPos > 0 && houseNumber) {
      let streetStartPos = houseNumberPos - 1;
      while (streetStartPos > 0) {
        const w = words[streetStartPos];
        const lower = w.toLowerCase();
        if (!/[а-яёіїєА-ЯЁЇІЄa-zA-Z]/.test(w)) break;
        if (isNoiseWord && isNoiseWord(lower)) break;
        if (REQUEST_WORDS && REQUEST_WORDS.some(n => lower === n)) break;
        if (ENTRANCE_MARKERS && ENTRANCE_MARKERS.test(lower)) break;
        if (GATE_MARKERS && GATE_MARKERS.some(m => lower.includes(m))) break;
        if (STATE_MARKERS && STATE_MARKERS.some(m => lower.includes(m))) break;
        streetStartPos--;
      }
      streetStartPos++;

      let streetWords = words.slice(streetStartPos, houseNumberPos);
      streetWords = streetWords.filter(w => {
        const lower = w.toLowerCase();
        if (isNoiseWord && isNoiseWord(lower)) return false;
        if (REQUEST_WORDS && REQUEST_WORDS.some(n => lower === n)) return false;
        if (ENTRANCE_MARKERS && ENTRANCE_MARKERS.test(lower)) return false;
        return true;
      });

      let streetName = streetWords.join(' ');

      if (STREET_PREFIXES) {
        STREET_PREFIXES.forEach(prefix => {
          streetName = streetName.replace(new RegExp(`^${prefix}\\s+`, 'i'), '');
        });
      }

      streetName = streetName.replace(/[.,;]+$/, '').trim();
      streetName = streetName.replace(/,+$/, '').trim();

      if (streetName.length >= 3) {
        const normalizedAddress = streetName.toLowerCase();
        const addressHasAccessMarker = ACCESS_DESCRIPTION_MARKERS && ACCESS_DESCRIPTION_MARKERS.some(m => normalizedAddress.includes(m));
        if (!addressHasAccessMarker) {
          address = houseNumber ? `${streetName}, ${houseNumber}` : streetName;
        }
      }
    }

    const entrancePattern1 = text.match(/(\d+)\s+(?:пд|под.+зд|подь?зд|під.+їзд)/gi);
    if (entrancePattern1) {
      entrancePattern1.forEach(m => {
        const trimmed = m.trim();
        if (trimmed && !accessParts.includes(trimmed)) accessParts.push(trimmed);
      });
    }

    const entrancePattern2 = text.match(/(\d+)\s+під'їзд/gi);
    if (entrancePattern2) {
      entrancePattern2.forEach(m => {
        const trimmed = m.trim();
        if (trimmed && !accessParts.includes(trimmed)) accessParts.push(trimmed);
      });
    }

    for (const word of words) {
      const lower = word.toLowerCase();
      const ordForm = ORDINAL_WORD_FORMS && ORDINAL_WORD_FORMS[lower];
      if (ordForm !== undefined) {
        const wordIdx = words.indexOf(word);
        if (wordIdx + 1 < words.length && ENTRANCE_MARKERS && ENTRANCE_MARKERS.test(words[wordIdx + 1])) {
          const entry = `${word} ${words[wordIdx + 1]}`;
          if (!accessParts.includes(entry)) accessParts.push(entry);
        }
      }
    }

    for (const pos of numberPositions) {
      if (pos === houseNumberPos) continue;
      if (isPrecededByEntrance && isPrecededByEntrance(pos, words)) {
        const num = words[pos].trim();
        if (num && !accessParts.includes(num)) accessParts.push(num);
      }
    }

    for (let i = 0; i < words.length - 1; i++) {
      const w = words[i];
      const next = words[i + 1];
      const lowerW = w.toLowerCase();
      const lowerNext = next.toLowerCase();
      if (/^\d+$/.test(w) && KEY_LOCATION_MARKERS && KEY_LOCATION_MARKERS.some(m => lowerNext.includes(m))) {
        const entry = `${lowerNext} ${w}`;
        if (!accessParts.includes(entry)) accessParts.push(entry);
      }
    }

    for (let i = 0; i < words.length - 1; i++) {
      const w = words[i];
      const next = words[i + 1];
      const lowerW = w.toLowerCase();
      if (KEY_LOCATION_MARKERS && KEY_LOCATION_MARKERS.some(m => lowerW.includes(m)) && /^\d+$/.test(next)) {
        const entry = `${lowerW} ${next}`;
        if (!accessParts.includes(entry)) accessParts.push(entry);
      }
    }

    for (const marker of (STATE_MARKERS || [])) {
      const idx = text.toLowerCase().indexOf(marker);
      if (idx >= 0) {
        const stateWord = text.slice(idx, idx + marker.length).trim();
        if (stateWord && !accessParts.includes(stateWord)) {
          accessParts.push(stateWord);
        }
      }
    }

    for (const marker of (GATE_MARKERS || [])) {
      if (text.toLowerCase().includes(marker)) {
        if (!accessParts.includes(marker)) {
          accessParts.push(marker);
        }
      }
    }

    const phoneMatches = text.match(/(?:\+?380)?\d{10,}/g);
    if (phoneMatches) {
      phoneMatches.forEach(p => {
        if (!accessParts.includes(p)) {
          accessParts.push(p.trim());
        }
      });
    }

    for (const marker of (KEY_LOCATION_MARKERS || [])) {
      const idx = text.toLowerCase().indexOf(marker);
      if (idx >= 0) {
        const markerEnd = idx + marker.length;
        const afterMarker = text.slice(markerEnd, markerEnd + 10).trim();
        const afterNumberMatch = afterMarker.match(/^[\s,]*(\d+)/);
        const numberPart = afterNumberMatch ? afterNumberMatch[1] : '';
        const context = numberPart ? `${marker} ${numberPart}` : marker;
        if (context && !accessParts.includes(context)) {
          accessParts.push(context);
        }
      }
    }

    for (const marker of (OSBB_MARKERS || [])) {
      if (text.toLowerCase().includes(marker.toLowerCase())) {
        if (!accessParts.includes(marker)) {
          accessParts.push(marker);
        }
      }
    }

    return {
      address: address,
      code: accessParts.join('; '),
    };
  }

  function formatParsedSummary(parsed) {
    return [
      parsed.zone ? `зона ${parsed.zone}` : '',
      parsed.address ? `адрес ${parsed.address}` : '',
      parsed.code ? `код ${parsed.code}` : '',
    ].filter(Boolean).join(', ');
  }

  function normalizeZone(value) {
    const numberParser = window.VoiceNumberParser;
    if (!value) return '';
    const withDigits = numberParser ? numberParser.replaceNumberWords(value) : value;
    const apartmentLike = withDigits.match(/^(кв(?:\.|артира)?|стр(?:\.|оение)?|с\.)\s*(\d+)$/iu);
    if (apartmentLike) {
      return `${apartmentLike[1].trim()} ${apartmentLike[2]}`.replace(/\s+/g, ' ').trim();
    }
    const match = withDigits.match(/\d+/);
    return match ? match[0] : '';
  }

  function normalizeCode(value) {
    const numberParser = window.VoiceNumberParser;
    if (!value) return '';
    const withDigits = numberParser ? numberParser.replaceNumberWords(value) : value;
    const match = withDigits.match(/\d+/);
    return match ? match[0] : withDigits.replace(/[^\w\p{L}'’ʼ-]/gu, '').trim();
  }

  function normalizeAddress(value) {
    const numberParser = window.VoiceNumberParser;
    const accessMarkers = window.VoiceAccessMarkers;
    if (!value) return '';
    let text = numberParser ? numberParser.replaceNumberWords(value) : value;
    text = text.trim();
    text = text.replace(/[.,;:\s]+$/g, '').trim();
    if (!/\p{L}/u.test(text)) return '';
    if (!/\d/u.test(text)) return '';
    const accessAfterComma = text.match(/,\s*(.+)$/);
    if (accessAfterComma && accessMarkers && accessMarkers.isAccessDescription(accessAfterComma[1])) {
      text = text.slice(0, accessAfterComma.index).trim();
    }
    const doubleCommaNum = text.match(/^(.+?\d+[\p{L}a-z'’ʼ]?)\s*,\s*(\d{2,})\s*$/u);
    if (doubleCommaNum) {
      text = doubleCommaNum[1].trim();
    }
    const accessSuffix = text.match(/^(.+?)\s+(кв\.?|квартира|офис|подъезд|подьезд|парадн|этаж|домофон|калитк|калиточк|ворот|двер|вход|ключ|код|консьерж|вахтер|охран|диспетчер|жэк|жек|брелок|чип|магнит).*$/iu);
    if (accessSuffix) {
      text = accessSuffix[1].trim();
    }
    if (!/\p{L}/u.test(text)) return '';
    if (!/\d/u.test(text)) return '';
    text = text.replace(/^(\p{L})/u, (char) => char.toUpperCase());
    const match = text.match(/([^\d,]+?)\s+(\d+[\p{L}a-z'’ʼ]?)$/iu);
    if (match && !match[1].includes(',') && !match[1].trim().endsWith(',')) {
      text = `${match[1].trim()}, ${match[2]}`;
    }
    return text.replace(/\s+/g, ' ').replace(/\s*,\s*/g, ', ').trim();
  }

  function normalizeParsedParts(parts) {
    const safe = parts || {};
    let address = normalizeAddress(safe.address || '');
    let code = normalizeCode(safe.code || '');
    const zone = normalizeZone(safe.zone || '');

    const accessMarkers = window.VoiceAccessMarkers;
    if (!address && code) {
      const isApartmentCode = /^(?:кв\.|квартира|стр\.|с\.)\s*\d+/iu.test(code);
      const codeHasAddress = !isApartmentCode && /[\p{L}][^\d]{0,50}?\s+\d+[\p{L}a-z'’ʼ]?/iu.test(code);
      const codeHasAccess = accessMarkers && accessMarkers.isAccessDescription(code);
      if (codeHasAddress && !codeHasAccess) {
        address = normalizeAddress(code);
        code = '';
      }
    }

    if (address && !code && accessMarkers && accessMarkers.isAccessDescription(address)) {
      code = address;
      address = '';
    }

    if (address) {
      const commaParts = address.split(',').map(s => s.trim());
      if (commaParts.length >= 3) {
        const lastPart = commaParts[commaParts.length - 1];
        if (!code) code = lastPart;
        address = commaParts.slice(0, -1).join(', ');
      } else if (commaParts.length === 2) {
        const lastPart = commaParts[1];
        if (accessMarkers && accessMarkers.isAccessDescription(lastPart)) {
          if (!code) code = lastPart;
          address = commaParts[0];
        }
      }
    }

    return {
      zone,
      address,
      code,
      confidence: Number.isFinite(safe.confidence) ? safe.confidence : 0,
    };
  }

  function hasRecognizedFields(parsed) {
    return !!(parsed && (parsed.zone || parsed.address || parsed.code));
  }

  window.VoiceSmartParser = {
    smartParseVoice,
    formatParsedSummary,
    normalizeZone,
    normalizeCode,
    normalizeAddress,
    normalizeParsedParts,
    hasRecognizedFields,
    KNOWN_ACCESS_TERMS,
  };
})();