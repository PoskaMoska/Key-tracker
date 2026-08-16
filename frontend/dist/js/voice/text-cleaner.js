;(function () {
  'use strict';

  const NOISE_WORDS = /^(?:мм|ээ|эм|гм|ах|ох|ух|ах|о|а|э|е|呃|嗯|呃м|ам|гмм|эээ|ааа|ооо|ууу|мда|ага|эмм|гммм|呃мм|嗯嗯)\s*/iu;
  const STUTTER_RE = /(\w)\1{2,}/g;
  const REPEATED_CHARS_RE = /(.)\1{3,}/g;

  function fixSplitWords(text) {
    let fixed = text;
    const joinablePairs = [
      ['под', 'ъезд', 'подъезд'], ['под', 'ьезд', 'подъезд'],
      ['під', 'їзд', 'підїзд'], ['пі', 'дїзд', 'підїзд'],
      ['квар', 'тира', 'квартира'], ['ква', 'ртира', 'квартира'],
      ['подъ', 'езд', 'подъезд'], ['подь', 'езд', 'подъезд'],
      ['пара', 'дный', 'парадный'], ['пара', 'дное', 'парадное'],
      ['домо', 'фон', 'домофон'], ['до', 'мофон', 'домофон'],
      ['кали', 'тка', 'калитка'], ['кали', 'точка', 'калиточка'],
      ['этаж', 'ей', 'этаже'], ['по', 'верх', 'поверх'],
    ];
    for (const [first, second, result] of joinablePairs) {
      const pattern = new RegExp(`${first}\\s+${second}`, 'gi');
      fixed = fixed.replace(pattern, result);
    }
    const splitPattern = /([а-яёіїєА-ЯЁЇІЄa-zA-Z])(\s+)([а-яёіїєА-ЯЁЇІЄa-zA-Z]{1,3})/g;
    fixed = fixed.replace(splitPattern, (match, p1, p2, p3) => {
      if (p2.length <= 1) return p1 + p3;
      return match;
    });
    return fixed;
  }

  function fixStuttering(text) {
    let cleaned = text;
    cleaned = cleaned.replace(/\b([а-яёіїєА-ЯЁЇІЄa-zA-Z]{1,2})\s+([а-яёіїєА-ЯЁЇІЄa-zA-Z]{2,})\s+\2\b/gi, '$1$2');
    cleaned = cleaned.replace(/\b([а-яёіїєА-ЯЁЇІЄa-zA-Z]{1,3})\s+([а-яёіїєА-ЯЁЇІЄa-zA-Z]{2,})\s+\2\b/gi, '$1$2');
    return cleaned;
  }

  function fixCommonSpeechErrors(text) {
    let fixed = text;
    const replacements = [
      [/\bпод\s*ъ\s*езд\b/gi, 'подъезд'],
      [/\bпод\s*ь\s*зд\b/gi, 'подъезд'],
      [/\bпід\s*ї\s*зд\b/gi, 'підїзд'],
      [/\bквар\s*ти\s*ра\b/gi, 'квартира'],
      [/\bкв\s*артира\b/gi, 'квартира'],
      [/\bподъ\s*ед\b/gi, 'подъезд'],
      [/\bподь\s*ед\b/gi, 'подъезд'],
      [/\bпід\s*ед\b/gi, 'підїзд'],
      [/\bпара\s*дн\b/gi, 'парадн'],
      [/\bдомо\s*ф\b/gi, 'домофон'],
      [/\bкали\s*тк\b/gi, 'калитка'],
      [/\bета\s*ж\b/gi, 'этаж'],
      [/\bпо\s*ерх\b/gi, 'поверх'],
      [/\bкод\s*ов\b/gi, 'кодов'],
      [/\bох\s*ран\b/gi, 'охран'],
      [/\bвах\s*тер\b/gi, 'вахтер'],
      [/\bжэ\s*к\b/gi, 'жэк'],
      [/\bжи\s*к\b/gi, 'жик'],
      [/\bдис\s*петчер\b/gi, 'диспетчер'],
      [/\bкон\s*сьерж\b/gi, 'консьерж'],
      [/\bресепш\b/gi, 'ресепшн'],
      [/\bшлаг\s*баум\b/gi, 'шлагбаум'],
      [/\bтурни\s*кет\b/gi, 'турникет'],
      [/\bмаг\s*нит\b/gi, 'магнит'],
      [/\bбре\s*лок\b/gi, 'брелок'],
      [/\bтаб\s*летка\b/gi, 'таблетка'],
    ];
    for (const [pattern, replacement] of replacements) {
      fixed = fixed.replace(pattern, replacement);
    }
    fixed = fixed.replace(/([а-яёіїєА-ЯЁЇІЄa-z])\s+([а-яёіїєА-ЯЁЇІЄa-z])\s+([а-яёіїєА-ЯЁЇІЄa-z])/g, (match, a, b, c) => {
      if (b.length === 1 && /[ъьй]'/.test(b)) return a + b + c;
      if (/\s/.test(match)) {
        const combined = a + b + c;
        if (/^[а-яёіїєА-ЯЁЇІЄ]{4,}$/.test(combined)) return combined;
      }
      return match;
    });
    return fixed;
  }

  function cleanInterjections(text) {
    let cleaned = text;
    const interjections = [
      /\bэ\s*то\b/gi, /\bэто\s+самое\b/gi, /\bв\s*общем\b/gi,
      /\bтак\s*сказать\b/gi, /\bкак\s*бы\b/gi, /\bв\s*принципе\b/gi,
      /\bну\s*вот\b/gi, /\bзначит\b/gi, /\bвот\b/gi,
    ];
    for (const pattern of interjections) {
      cleaned = cleaned.replace(pattern, ' ');
    }
    return cleaned;
  }

  function cleanNoise(text) {
    if (!text) return '';
    let cleaned = text;
    cleaned = cleanInterjections(cleaned);
    cleaned = cleaned.replace(NOISE_WORDS, '');
    cleaned = cleaned.replace(STUTTER_RE, '$1$1');
    cleaned = cleaned.replace(REPEATED_CHARS_RE, '$1$1');
    cleaned = fixSplitWords(cleaned);
    cleaned = fixStuttering(cleaned);
    cleaned = fixCommonSpeechErrors(cleaned);
    return cleaned.replace(/[\s]+/g, ' ').trim();
  }

  window.VoiceTextCleaner = {
    cleanNoise,
    fixSplitWords,
    fixStuttering,
    fixCommonSpeechErrors,
    cleanInterjections,
  };
})();