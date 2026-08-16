;(function () {
  'use strict';

  const PHONETIC_VARIATIONS = {
    'р': ['л', 'рь'],
    'л': ['р'],
    'б': ['п'],
    'п': ['б'],
    'в': ['ф'],
    'ф': ['в'],
    'д': ['т'],
    'т': ['д'],
    'г': ['к', 'х'],
    'к': ['г', 'х'],
    'х': ['г', 'к'],
    'ж': ['ш'],
    'ш': ['ж', 'с'],
    'з': ['с', 'ц'],
    'с': ['з', 'ш', 'ц'],
    'ц': ['с', 'з', 'ч'],
    'ч': ['щ', 'ц'],
    'щ': ['ч', 'ш'],
    'е': ['э', 'о', 'и'],
    'э': ['е', 'о'],
    'о': ['е', 'э', 'а'],
    'ё': ['о', 'е'],
    'й': ['и', 'ь'],
    'ь': ['й'],
    'ъ': [''],
    'і': ['и', 'і'],
    'ї': ['і', 'йі'],
    'є': ['е', 'э'],
  };

  function levenshtein(a, b) {
    if (!a) return b ? b.length : 0;
    if (!b) return a.length;
    const matrix = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b[i - 1] === a[j - 1]) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    return matrix[b.length][a.length];
  }

  function phoneticallySimilar(word, maxDist) {
    const variants = new Set();
    const limit = maxDist !== undefined ? maxDist : 1;
    for (let i = 0; i < word.length; i++) {
      const char = word[i].toLowerCase();
      if (PHONETIC_VARIATIONS[char]) {
        for (const sub of PHONETIC_VARIATIONS[char]) {
          const candidate = word.slice(0, i) + sub + word.slice(i + 1);
          if (candidate !== word) variants.add(candidate);
        }
      }
    }
    return variants;
  }

  function fuzzyMatch(a, b, maxDist) {
    if (a === b) return true;
    const aLow = a.toLowerCase();
    const bLow = b.toLowerCase();
    if (aLow === bLow) return true;
    if (aLow.startsWith(bLow) || bLow.startsWith(aLow)) return true;
    const dist = maxDist !== undefined ? maxDist : 2;
    if (levenshtein(aLow, bLow) <= dist) return true;
    return false;
  }

  function fuzzyMatchText(text, marker, maxLevenshtein) {
    const markerLow = marker.toLowerCase();
    const words = text.toLowerCase().split(/[\s.,:;!?]+/);
    const limit = maxLevenshtein !== undefined ? maxLevenshtein : 2;
    for (const word of words) {
      if (word === markerLow) return true;
      const dist = levenshtein(word, markerLow);
      if (dist <= limit) return true;
      const stemmedWord = stemRu(word);
      const stemmedMarker = stemRu(markerLow);
      if (stemmedWord === stemmedMarker) return true;
      const distStemmed = levenshtein(stemmedWord, stemmedMarker);
      if (distStemmed <= 1) return true;
    }
    const phonVariants = phoneticallySimilar(markerLow, 1);
    for (const variant of phonVariants) {
      if (text.toLowerCase().includes(variant)) return true;
    }
    return false;
  }

  function stemRu(word) {
    let s = word.toLowerCase();
    const prefixes = ['под', 'пере', 'вы', 'вз', 'воз', 'из', 'на', 'за', 'до', 'про', 'со', 'об', 'от', 'с', 'о'];
    for (const p of prefixes) {
      if (s.startsWith(p) && s.length > p.length + 2) {
        s = s.slice(p.length);
        break;
      }
    }
    const suffixes = ['а', 'я', 'у', 'ю', 'ой', 'ей', 'ый', 'ий', 'ое', 'ее', 'ая', 'яя', 'ому', 'ему', 'ого', 'его', 'ин', 'ын', 'ен'];
    for (const suff of suffixes) {
      if (s.endsWith(suff) && s.length > suff.length + 2) {
        s = s.slice(0, -suff.length);
        break;
      }
    }
    return s;
  }

  function findSimilarWord(token, dictionary, maxDist) {
    const low = token.toLowerCase();
    if (dictionary[low] !== undefined) return token;
    for (const sub of phoneticallySimilar(low, maxDist)) {
      if (dictionary[sub] !== undefined) return sub;
    }
    for (const variant of phoneticallySimilar(low, 1)) {
      const dist = levenshtein(low, variant);
      if (dist <= maxDist && dictionary[variant] !== undefined) return variant;
    }
    return null;
  }

  window.VoiceFuzzyMatcher = {
    levenshtein,
    phoneticallySimilar,
    fuzzyMatch,
    fuzzyMatchText,
    stemRu,
    findSimilarWord,
  };
})();