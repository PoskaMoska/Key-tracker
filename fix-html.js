const fs = require('fs');
let lines = fs.readFileSync('public/index.html', 'utf8').split('\n');
lines[89] = '            <div class="field" style="display: none;">';
fs.writeFileSync('public/index.html', lines.join('\n'));
