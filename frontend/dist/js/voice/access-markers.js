;(function () {
  'use strict';

  const ACCESS_DESCRIPTION_MARKERS = [
    'кв', 'кв\\.', 'квартира',
    'офіс', 'офiс', 'кімната', 'кімнат',
    "під'їзд", 'підїзд', 'подъезд', 'подьезд',
    'парадн', 'парадное', 'парадный',
    'етаж', 'этаж', 'поверх',
    'домофон', 'домофонн',
    'калитк', 'калиточк', 'ворот', 'ворот',
    'двер', 'дверь', 'вход', 'входн',
    'кодов', 'кодовый', 'кодовом',
    'консьерж', 'вахтер', 'охран', 'охрана',
    'осбб', 'управляющ', 'диспетчер', 'админист',
    'жэк', 'жек', 'жек',
    'ключ', 'слесар', 'вахт',
    'ресепш', 'админ', 'регистратур', 'стойк',
    'пропуск', 'пропускн', 'турникет', 'шлагбаум',
    'переговор', 'звонок', 'брелок', 'таблетк', 'чип', 'магнит',
    'відкривається', 'відкрити', 'відкриє', 'відчинено', 'зачинено',
    'набрати', 'дзвонити', 'поки', 'потрібно', 'треба',
  ];

  const LEADING_NOISE_WORDS = new Set([
    'погода', 'сегодня', 'завтра', 'вчера', 'хорошая', 'хороший', 'хорошее',
    'плохая', 'плохой', 'плохое', 'отличная', 'классная', 'супер',
    'нормальная', 'нормальный', 'нормальное', 'ладно', 'короче', 'вообще',
    'типа', 'вроде', 'кажется', 'запиши', 'запишите', 'пожалуйста',
    'спасибо', 'здравствуйте', 'привет', 'смотри', 'слушай',
    'значит', 'вот', 'это', 'ну', 'да', 'нет', 'хорошо',
    'пойдем', 'давай', 'добавь', 'добавить', 'добавляю', 'внести', 'вношу', 'введите',
    'информация', 'информацию', 'данные', 'данн',
    'утром', 'вечером', 'днём', 'ночью', 'было', 'будет', 'есть', 'нету', 'будто',
    'солнышко', 'дождь', 'солнце', 'небо', 'облачно', 'ясно', 'пасмурно', 'туман',
    'на улице', 'на дворе',
    'ходил', 'ходила', 'ходили', 'погулял', 'погуляла', 'погуляли', 'гулять', 'прогулка',
    'купил', 'купила', 'купили', 'покупать', 'покупка', 'магазин', 'мороженое', 'мороженого',
    'сходил', 'сходила', 'сходили', 'сходить', 'пошёл', 'пошла', 'пошли',
    'иду', 'идём', 'идти', 'шёл', 'шла', 'шли', 'шёл', 'пошёл',
    '回来', 'ходи', 'сходи', 'сходил', 'пойду', 'пойдут',
  ]);

  const ENTRANCE_MARKERS = /^(?:пд|под.+зд|подь?зд|під.+їзд|підекс)$/i;
  const KEY_LOCATION_BEFORE_MARKERS = /^(?:кв|квартира|офіс|кімната|вахт|жильц|будинок|дім)$/i;
  const GATE_MARKERS = ['калитк', 'ворот', 'домофон', 'шлагбаум', 'турникет', 'ворота'];
  const STATE_MARKERS = ['відкрито', 'відкрити', 'открито', 'открыто', 'открыти', 'закрито', 'закрыто', 'закритий'];
  const KEY_LOCATION_MARKERS = ['кв', 'кв\\.', 'квартира', 'офіс', 'кімната', 'вахті', 'вахта', 'жильцов', 'жильці', "подвір'я", 'дім', 'будинок'];
  const OSBB_MARKERS = ['осбб', 'осбб.', 'ОСББ'];
  const STREET_PREFIXES = ['вулиц', 'улиц', 'ул.', 'ул', 'проспект', 'просп.', 'пр.', 'провулок', 'пер.', 'площа', 'пл.', 'бульвар', 'б-р', 'вул', 'пров', 'просп'];
  const REQUEST_WORDS = ['мне', 'нужен', 'нужна', 'нужно', 'требуется', 'потрібно', 'адрес', 'код', 'номер', 'доступ', 'адреса', 'введіть', 'запишіть'];

  function isAccessDescription(text) {
    if (!text) return false;
    const normalized = String(text).toLowerCase();
    return ACCESS_DESCRIPTION_MARKERS.some((marker) => normalized.includes(marker));
  }

  function isNoiseWord(word) {
    return LEADING_NOISE_WORDS.has(word.toLowerCase());
  }

  function looksLikeStreetName(word) {
    if (!word || word.length < 3) return false;
    const lower = word.toLowerCase();
    if (REQUEST_WORDS.some(n => lower === n)) return false;
    if (ENTRANCE_MARKERS.test(lower)) return false;
    if (GATE_MARKERS.some(m => lower.includes(m))) return false;
    if (STATE_MARKERS.some(m => lower.includes(m))) return false;
    if (!/[а-яёіїєА-ЯЁЇІЄa-zA-Z]/.test(word)) return false;
    return true;
  }

  function isFollowedByEntrance(wordIdx, words) {
    const nextWord = wordIdx + 1 < words.length ? words[wordIdx + 1] : '';
    return ENTRANCE_MARKERS.test(nextWord);
  }

  function isPrecededByEntrance(wordIdx, words) {
    if (wordIdx === 0) return false;
    return ENTRANCE_MARKERS.test(words[wordIdx - 1]);
  }

  function trimLeadingNoiseToAccess(text) {
    if (!text) return '';
    const source = String(text).trim();
    const normalized = source.toLowerCase();
    let bestIndex = -1;

    for (const marker of ACCESS_DESCRIPTION_MARKERS) {
      const index = normalized.indexOf(marker);
      if (index >= 0 && (bestIndex === -1 || index < bestIndex)) {
        bestIndex = index;
      }
    }

    if (bestIndex <= 0) return source;
    const prefixWords = normalized
      .slice(0, bestIndex)
      .split(/\s+|[^\p{L}\p{N}'’ʼ]+/u)
      .filter(Boolean);
    if (!prefixWords.length || prefixWords.some((word) => !LEADING_NOISE_WORDS.has(word))) {
      return source;
    }
    return source.slice(bestIndex).trim();
  }

  function looksLikeNumber(token) {
    if (/^\d{1,6}[\а-яёіїєa-zA-Z]?$/i.test(token)) return true;
    const numParser = window.VoiceNumberParser;
    if (numParser) {
      const normalized = numParser.replaceNumberWords(token);
      if (/^\d{1,6}$/.test(normalized)) return true;
      const low = token.toLowerCase();
      if (numParser.NUM_WORDS[low] !== undefined) return true;
    }
    const match = token.match(/^(\d+)[а-яёіїєa-zA-Z]$/);
    if (match && match[1].length <= 6) return true;
    return false;
  }

  window.VoiceAccessMarkers = {
    ACCESS_DESCRIPTION_MARKERS,
    LEADING_NOISE_WORDS,
    ENTRANCE_MARKERS,
    KEY_LOCATION_BEFORE_MARKERS,
    GATE_MARKERS,
    STATE_MARKERS,
    KEY_LOCATION_MARKERS,
    OSBB_MARKERS,
    STREET_PREFIXES,
    REQUEST_WORDS,
    isAccessDescription,
    isNoiseWord,
    looksLikeStreetName,
    isFollowedByEntrance,
    isPrecededByEntrance,
    trimLeadingNoiseToAccess,
    looksLikeNumber,
  };
})();