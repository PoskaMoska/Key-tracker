const fs = require('fs');
let c = fs.readFileSync('public/index.html', 'utf8');
c = c.replace(/<div class="field">\s*<label for="person-name">ิศฮ<\/label>/, '<div class="field" style="display: none;">\n              <label for="person-name">ิศฮ</label>');
fs.writeFileSync('public/index.html', c);
