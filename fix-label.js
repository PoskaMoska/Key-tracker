const fs = require('fs');
let content = fs.readFileSync('public/index.html', 'utf8');
content = content.replace('<label for="bundle-list">Связка</label>', '<label for="bundle-list">Поиск связки</label>');
content = content.replace('<input type="text" id="bundle-search" class="search-input" placeholder="Поиск связки" autocomplete="off" />', '<input type="text" id="bundle-search" class="search-input" placeholder="Напр. 1_1 или 1_11" autocomplete="off" />');
fs.writeFileSync('public/index.html', content);
