;(function () {
  'use strict';

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  function errorMessage(errorCode) {
    switch (errorCode) {
      case 'not-allowed':
      case 'service-not-allowed':
        return 'Нет доступа к микрофону. Разрешите доступ в настройках браузера.';
      case 'no-speech':
        return 'Не услышал ничего. Попробуй ещё раз.';
      case 'audio-capture':
        return 'Микрофон не найден.';
      case 'network':
        return 'Сеть недоступна для распознавания речи.';
      case 'aborted':
        return '';
      default:
        return 'Ошибка распознавания речи: ' + errorCode;
    }
  }

  function isSecureContextOk() {
    if (typeof window === 'undefined') return true;
    if (window.isSecureContext) return true;
    const host = window.location && window.location.hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '::1';
  }

  function createAiParser(config) {
    const options = Object.assign({
      endpoint: '/api/voice/parse',
      getAuthToken: null,
      fetchImpl: typeof fetch === 'function' ? fetch.bind(window) : null,
    }, config || {});

    return async function aiParse(transcript, rawParsed) {
      if (!options.fetchImpl || !transcript || !transcript.trim()) {
        return null;
      }

      const headers = { 'Content-Type': 'application/json' };
      if (typeof options.getAuthToken === 'function') {
        const token = options.getAuthToken();
        if (token) headers.Authorization = `Bearer ${token}`;
      }

      const body = { transcript };
      if (typeof options.getZoneNum === 'function') {
        const zoneNum = options.getZoneNum();
        if (zoneNum) body.zoneNum = zoneNum;
      }

      const response = await options.fetchImpl(options.endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error(`AI parse failed with status ${response.status}`);
      }

      return response.json();
    };
  }

  function shouldUseAiFallback(parsed, transcript, options) {
    const smartParser = window.VoiceSmartParser;
    if (smartParser && smartParser.shouldUseAiFallback) {
      return smartParser.shouldUseAiFallback(parsed, transcript, options);
    }
    if (!options || typeof options.aiParse !== 'function') return false;
    if (!transcript || !transcript.trim()) return false;
    const numberParser = window.VoiceNumberParser;
    const normalizedTranscript = numberParser ? numberParser.replaceNumberWords(String(transcript)).toLowerCase() : String(transcript).toLowerCase();
    const meaningfulWords = normalizedTranscript
      .split(/\s+|[^\p{L}\p{N}'’ʼ]+/u)
      .filter(Boolean);
    const wordCount = meaningfulWords.length;
    const aiMode = options && options.aiMode === 'prefer' ? 'prefer' : 'fallback';
    const mentionsZone = /\b(зона|zone)\b/iu.test(transcript);
    const mentionsCode = /\b(код|пароль|доступ|номер|телефон|code|password)\b/iu.test(transcript);
    const hasLongAccessDescription = !!(parsed.code && /\p{L}/u.test(parsed.code) && wordCount >= 5);
    const hasComplexFreeformSpeech = wordCount >= 7;

    if (aiMode === 'prefer' && wordCount >= 3) return true;
    if (!parsed.address) return true;
    if (options.fields && options.fields.zone && mentionsZone && !parsed.zone) return true;
    if (options.fields && options.fields.code && mentionsCode && !parsed.code) return true;
    if (options.fields && options.fields.code && hasLongAccessDescription) return true;
    if (hasComplexFreeformSpeech && mentionsCode) return true;
    return false;
  }

  function getAiConfidenceThreshold(options) {
    if (!options || !Number.isFinite(options.aiConfidenceThreshold)) {
      return 70;
    }
    return Math.max(0, Math.min(100, Math.round(options.aiConfidenceThreshold)));
  }

  function parseTranscript(raw) {
    const smartParser = window.VoiceSmartParser;
    const textCleaner = window.VoiceTextCleaner;
    const fuzzyMatcher = window.VoiceFuzzyMatcher;
    const numberParser = window.VoiceNumberParser;
    const accessMarkers = window.VoiceAccessMarkers;

    if (!raw) return { zone: '', address: '', code: '' };

    let text = textCleaner ? textCleaner.cleanNoise(String(raw)
      .replace(/\s+точка(?!\p{L})/giu, '.')
      .replace(/\s+запятая(?!\p{L})/giu, ',')
      .replace(/\s+кома(?!\p{L})/giu, ',')
      .trim()) : String(raw).trim();

    const markerAliases = {
      zone: ['зон', 'зону', 'зоны', 'зоне', 'зона', 'зону', 'zone', 'son'],
      address: ['адрес', 'адреса', 'адресу', 'вулиц', 'улиц', 'address', 'adres', 'adresa'],
      code: ['код', 'кода', 'коду', 'пароль', 'доступ', 'номер', 'телефон', 'code', 'password'],
    };

    const hits = [];
    const fuzzyMatchText = fuzzyMatcher ? fuzzyMatcher.fuzzyMatchText : null;
    for (const [key, aliases] of Object.entries(markerAliases)) {
      for (const alias of aliases) {
        if (fuzzyMatchText && fuzzyMatchText(text, alias, 2)) {
          const idx = text.toLowerCase().indexOf(alias.toLowerCase());
          if (idx !== -1) {
            hits.push({ key, start: idx, end: idx + alias.length });
          }
          break;
        }
      }
    }
    hits.sort((a, b) => a.start - b.start);

    const parts = { zone: '', address: '', code: '' };

    const replaceNumberWords = numberParser ? numberParser.replaceNumberWords : null;
    const isAccessDescription = accessMarkers ? accessMarkers.isAccessDescription : null;
    const LEADING_NOISE_WORDS = accessMarkers ? accessMarkers.LEADING_NOISE_WORDS : null;
    const trimLeadingNoiseToAccess = accessMarkers ? accessMarkers.trimLeadingNoiseToAccess : null;
    const extractPhoneLikeValue = window.VoiceNumberParser ? window.VoiceNumberParser.parseNumberFromText : null;
    const PHONE_ONLY_RE = /\+?\d[\d\s().-]{7,}/;

    if (!hits.length) {
      text = replaceNumberWords ? replaceNumberWords(text) : text;
      const noLettersTranscript = text.replace(/[^\d+]/g, '');
      if (!/\p{L}/u.test(text) && /\d/u.test(noLettersTranscript)) {
        return { zone: '', address: '', code: noLettersTranscript };
      }
      const phoneOnlyTranscript = text.replace(/[^\d+\s().-]/g, '').trim();
      const normalizedPhoneOnly = extractPhoneLikeValue ? extractPhoneLikeValue(phoneOnlyTranscript) : null;
      if (PHONE_ONLY_RE.test(phoneOnlyTranscript) && normalizedPhoneOnly) {
        return { zone: '', address: '', code: normalizedPhoneOnly };
      }
      let addressText = text;

      const apartmentMatch = addressText.match(/\s*(?:кв(?:\.|артира)?|стр(?:\.|оение)?|с\.)\s*(\d+)\s*$/iu);
      if (apartmentMatch) {
        parts.code = apartmentMatch[0].trim();
        addressText = addressText.slice(0, apartmentMatch.index).trim();
      }

      if (!parts.code) {
        const phoneMatch = addressText.match(/[\s,]*(\+?\d[\d\s().-]{7,})\s*$/u);
        if (phoneMatch) {
          const normalizedPhone = extractPhoneLikeValue ? extractPhoneLikeValue(phoneMatch[1]) : null;
          if (normalizedPhone) {
            parts.code = normalizedPhone;
            addressText = addressText.slice(0, phoneMatch.index).trim();
          }
        }
      }

      if (!parts.code) {
        const addressWithCodeMatch = addressText.match(/^(.+?\s+\d+[\p{L}a-z'’ʼ]?)[,\s]+(\d{2,})\s*$/iu);
        if (addressWithCodeMatch) {
          parts.address = addressWithCodeMatch[1].trim();
          parts.code = addressWithCodeMatch[2];
          addressText = parts.address;
        }
      }

      if (!parts.code) {
        const explicitTail = addressText.match(/(?:номер|телефон|код|доступ|кв)\s*(\d{2,})\s*$/iu);
        if (explicitTail) {
          parts.code = explicitTail[1];
          addressText = addressText.slice(0, explicitTail.index).trim();
        }
      }

      if (!parts.address) {
        const addressWithTailMatch = addressText.match(/^(.+?\s+\d+[\p{L}a-z'’ʼ]?)[,\s]+(.+)$/iu);
        if (addressWithTailMatch) {
          const candidateAddress = addressWithTailMatch[1].trim();
          if (!isAccessDescription || !isAccessDescription(candidateAddress)) {
            parts.address = candidateAddress;
            parts.code = addressWithTailMatch[2].trim();
            addressText = parts.address;
          }
        }
      }

      addressText = addressText
        .toLowerCase()
        .split(/\s+/)
        .filter((word) => word && !(LEADING_NOISE_WORDS && LEADING_NOISE_WORDS.has(word)))
        .join(' ');

      if (!parts.address) {
        const addressOnlyMatch = addressText.match(/([\p{L}][^\d]{0,50}?\s+\d+[\p{L}a-z'’ʼ]?)$/iu);
        if (addressOnlyMatch) {
          const candidateAddress = addressOnlyMatch[1].trim();
          if (!isAccessDescription || !isAccessDescription(candidateAddress)) {
            parts.address = candidateAddress;
          }
        }
      }

      if (!parts.code) {
        const standaloneCode = addressText.match(/^\d{2,}$/u);
        if (standaloneCode) {
          parts.code = standaloneCode[0];
        }
      }

      if (!parts.address && !parts.code) {
        const cleanedTail = (replaceNumberWords ? replaceNumberWords(String(raw)) : String(raw))
          .replace(/[.,;:]+$/g, '')
          .replace(/\s+/g, ' ')
          .trim();
        if (cleanedTail && /\p{L}/u.test(cleanedTail) && (/\d/u.test(cleanedTail) || (isAccessDescription && isAccessDescription(cleanedTail)))) {
          parts.code = trimLeadingNoiseToAccess ? trimLeadingNoiseToAccess(cleanedTail) : cleanedTail;
        }
      }
    } else {
      if (hits[0].start > 0) {
        const prefix = text.slice(0, hits[0].start).trim();
        if (prefix) parts.address = prefix;
      }
      for (let index = 0; index < hits.length; index += 1) {
        const hit = hits[index];
        const nextHit = hits[index + 1];
        const segment = text.slice(hit.end, nextHit ? nextHit.start : text.length).trim();
        if (segment) {
          parts[hit.key] = segment;
        }
      }
    }

    const normalized = smartParser && smartParser.normalizeParsedParts
      ? smartParser.normalizeParsedParts(parts)
      : parts;
    if (normalized.address && !normalized.code && isAccessDescription && isAccessDescription(normalized.address)) {
      normalized.code = normalized.address;
      normalized.address = '';
    }
    return {
      zone: normalized.zone,
      address: normalized.address,
      code: normalized.code,
    };
  }

  function attach(button, opts) {
    const smartParser = window.VoiceSmartParser;
    const accessMarkers = window.VoiceAccessMarkers;
    const numberParser = window.VoiceNumberParser;

    const options = Object.assign({
      lang: 'uk-UA',
      fallbackLang: 'ru-RU',
      aiParse: null,
      aiMode: 'fallback',
      aiConfidenceThreshold: 70,
      fields: {},
      isActive: () => true,
      getZoneNum: null,
      showToast: () => {},
      onApplied: () => {},
    }, opts || {});

    if (!button) return { destroy() {}, start() {}, stop() {} };
    if (!SpeechRecognition) {
      button.style.display = 'none';
      return { destroy() {}, start() {}, stop() {} };
    }

    const secureOk = isSecureContextOk();
    const rootStyle = getComputedStyle(document.documentElement);
    const accentColor = rootStyle.getPropertyValue('--accent').trim() || '#4f8cff';
    const mutedColor = rootStyle.getPropertyValue('--text-muted').trim() || '#888';

    let recognition = null;
    let currentLang = options.lang;
    let triedFallback = false;
    let active = false;
    let speechTimeout = null;

    const LEADING_NOISE_WORDS = accessMarkers ? accessMarkers.LEADING_NOISE_WORDS : null;
    const ACCESS_DESCRIPTION_MARKERS = accessMarkers ? accessMarkers.ACCESS_DESCRIPTION_MARKERS : null;
    const formatParsedSummary = smartParser ? smartParser.formatParsedSummary : null;
    const normalizeParsedParts = smartParser ? smartParser.normalizeParsedParts : null;
    const hasRecognizedFields = smartParser ? smartParser.hasRecognizedFields : null;
    const smartParseVoice = smartParser ? smartParser.smartParseVoice : null;

    function createRecognition(lang) {
      const recognitionInstance = new SpeechRecognition();
      recognitionInstance.lang = lang;
      recognitionInstance.interimResults = false;
      recognitionInstance.maxAlternatives = 1;
      recognitionInstance.continuous = false;
      return recognitionInstance;
    }

    function setActive(flag) {
      active = flag;
      button.style.color = flag ? accentColor : mutedColor;
      button.classList.toggle('voice-input-btn--recording', flag);
      if (flag) {
        button.setAttribute('aria-pressed', 'true');
      } else {
        button.removeAttribute('aria-pressed');
      }
    }

    function applyParsed(parsed) {
      const { fields } = options;
      if (fields.zone && parsed.zone) fields.zone.value = parsed.zone;
      if (fields.address && parsed.address) fields.address.value = parsed.address;
      if (fields.code && parsed.code) fields.code.value = parsed.code;

      for (const name of ['zone', 'address', 'code']) {
        const field = fields[name];
        if (field && parsed[name]) {
          field.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }

      try { options.onApplied(parsed); } catch (error) { /* ignore */ }
    }

    async function handleResult(event) {
      const transcript = (event.results[0] && event.results[0][0] && event.results[0][0].transcript || '').trim();
      if (!transcript) {
        if (options.fallbackLang && !triedFallback) {
          triedFallback = true;
          currentLang = options.fallbackLang;
          bindAndStart();
          return;
        }
        options.showToast('Не услышал ничего. Попробуй ещё раз.');
        return;
      }

      const needsFallback = detectNeedsFallback(transcript);
      if (!triedFallback && (needsFallback || !hasRecognizedFields(parseTranscript(transcript)))) {
        triedFallback = true;
        currentLang = options.fallbackLang;
        bindAndStart();
        return;
      }

      let parsed = parseTranscript(transcript);
      let usedAi = false;

      if (smartParseVoice) {
        const smartResult = smartParseVoice(transcript);
        const hasNoiseWords = LEADING_NOISE_WORDS && (
          LEADING_NOISE_WORDS.has(transcript.toLowerCase().split(/\s+/)[0]) ||
          /\b(утром|вечером|днём|было|будет|солнышко|дождь)\b/i.test(transcript)
        );
        const smartAddressNormalized = smartResult.address ? smartResult.address.toLowerCase() : '';
        const smartAddressHasAccess = smartAddressNormalized && ACCESS_DESCRIPTION_MARKERS && ACCESS_DESCRIPTION_MARKERS.some(m => smartAddressNormalized.includes(m));
        if (smartResult.address && smartResult.address.length > 5 && !smartAddressHasAccess) {
          parsed.address = smartResult.address;
          if (smartResult.code) {
            let existingCode = parsed.code ? parsed.code.trim() : '';
            const smartCodeParts = smartResult.code.split(';').filter(p => p.trim());
            smartCodeParts.forEach(part => {
              const trimmed = part.trim();
              if (trimmed && !existingCode.toLowerCase().includes(trimmed.toLowerCase())) {
                existingCode = existingCode ? `${existingCode}; ${trimmed}` : trimmed;
              }
            });
            parsed.code = existingCode;
          }
          if (hasNoiseWords) {
            applyParsed(parsed);
            options.showToast(formatParsedSummary ? `Услышано: ${formatParsedSummary(parsed)}` : `Услышано`);
            return;
          }
        } else if (smartResult.code && !parsed.code) {
          parsed.code = smartResult.code;
        }
      }

      if (shouldUseAiFallback(parsed, transcript, options)) {
        try {
          const aiParsed = normalizeParsedParts ? normalizeParsedParts(await options.aiParse(transcript, parsed)) : parsed;
          if (hasRecognizedFields && hasRecognizedFields(aiParsed) && aiParsed.confidence >= getAiConfidenceThreshold(options)) {
            parsed = aiParsed;
            usedAi = true;
          } else if (hasRecognizedFields && hasRecognizedFields(aiParsed)) {
            options.showToast(`AI не уверен в результате (${aiParsed.confidence}%). Проверьте ввод вручную.`);
          }
        } catch (error) {
          console.warn('[VoiceInput] AI fallback failed:', error);
        }
      }

      if (!hasRecognizedFields(parsed)) {
        options.showToast(`Услышано: "${transcript}", но не удалось распознать поля`);
        return;
      }

      applyParsed(parsed);
      const summary = formatParsedSummary ? formatParsedSummary(parsed) : 'Результат обработан';
      options.showToast(usedAi ? `AI уточнил: ${summary}` : `Услышано: ${summary}`);
    }

    function detectNeedsFallback(transcript) {
      if (!transcript) return false;
      const text = transcript.toLowerCase();
      const ukMarkers = /\b(і|ї|є|не\s+слышал|не\s+чув|будь\s+ласка|дякую|вибач|алло|алё)\b/u;
      const enMarkers = /\b(the|this|that|hello|hi|yes|no|please|thanks|number|address|code|access|zone)\b/i;
      if (ukMarkers.test(text) || enMarkers.test(text)) return true;
      const slurredPatterns = [
        /[бвгджзклмнпрстфхцчшщ]{5,}/i,
        /\w{1,2}\s+\w{1,2}\s+\w{1,2}/i,
        /\b[а-я]{1,2}\b.*\b[а-я]{1,2}\b.*\b[а-я]{1,2}\b/i,
        /\b[а-я]{1,2}\b\s{2,}/i,
        /[а-я]\s[а-я]\s[а-я]/i,
      ];
      for (const pattern of slurredPatterns) {
        if (pattern.test(transcript)) return true;
      }
      return false;
    }

    function handleError(event) {
      if (event.error === 'aborted') return;
      console.warn('[VoiceInput] recognition error:', event.error);
      const message = errorMessage(event.error || 'unknown');
      if (message) options.showToast(message);
      setActive(false);
    }

    function handleEnd() {
      setActive(false);
      clearTimeout(speechTimeout);
      speechTimeout = null;
    }

    function onSpeechActivity() {
      clearTimeout(speechTimeout);
      speechTimeout = null;
    }

    function startSpeechTimeout() {
      clearTimeout(speechTimeout);
      speechTimeout = setTimeout(() => {
        if (active) {
          options.showToast('Говорите громче или ближе к микрофону');
        }
      }, 8000);
    }

    function bindAndStart() {
      clearTimeout(speechTimeout);
      speechTimeout = null;
      triedFallback = false;
      currentLang = options.lang;
      try {
        recognition = createRecognition(currentLang);
        recognition.addEventListener('result', (event) => {
          onSpeechActivity();
          handleResult(event);
        });
        recognition.addEventListener('error', (event) => {
          onSpeechActivity();
          handleError(event);
        });
        recognition.addEventListener('end', handleEnd);
        recognition.addEventListener('start', () => {
          options.showToast('🎙 Говорите…');
          startSpeechTimeout();
        });
        recognition.start();
        setActive(true);
      } catch (error) {
        console.error('[VoiceInput] start failed:', error);
        clearTimeout(speechTimeout);
        speechTimeout = null;
        options.showToast('Не удалось запустить голосовой ввод: ' + (error && error.message ? error.message : error));
        setActive(false);
      }
    }

    function start() {
      if (active) {
        stop();
        return;
      }
      if (!secureOk) {
        options.showToast('Голосовой ввод требует HTTPS. Откройте сайт по https:// или через localhost.');
        return;
      }
      if (!options.isActive()) {
        options.showToast('Откройте форму адреса, чтобы использовать голосовой ввод');
        return;
      }
      bindAndStart();
    }

    function stop() {
      clearTimeout(speechTimeout);
      speechTimeout = null;
      if (recognition && active) {
        try { recognition.stop(); } catch (error) { /* ignore */ }
      }
      setActive(false);
    }

    const clickHandler = (event) => {
      event.preventDefault();
      event.stopPropagation();
      start();
    };
    button.addEventListener('click', clickHandler);

    return {
      start,
      stop,
      destroy() {
        button.removeEventListener('click', clickHandler);
        stop();
      },
    };
  }

  window.VoiceInput = {
    attach,
    createAiParser,
    normalizeParsedParts: window.VoiceSmartParser ? window.VoiceSmartParser.normalizeParsedParts : null,
    hasRecognizedFields: window.VoiceSmartParser ? window.VoiceSmartParser.hasRecognizedFields : null,
    shouldUseAiFallback,
    getAiConfidenceThreshold,
    parseTranscript,
    replaceNumberWords: window.VoiceNumberParser ? window.VoiceNumberParser.replaceNumberWords : null,
    smartParseVoice: window.VoiceSmartParser ? window.VoiceSmartParser.smartParseVoice : null,
    isSupported: () => !!SpeechRecognition,
  };
})();