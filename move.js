const fs = require('fs');
let lines = fs.readFileSync('public/index.html', 'utf8').split('\n');
const startH = lines.findIndex(l => l.includes('header-profile-actions'));
if (startH !== -1) {
    lines.splice(startH, 4);
}

const startB = lines.findIndex(l => l.includes('id="btn-manage-people"'));
if (startB !== -1) {
    lines.splice(startB + 2, 0,
'              <div class="header-profile-actions" style="display: none; align-items: center; justify-content: center; gap: 8px; width: 100%; margin-top: 0.75rem;" id="header-profile-actions">',
'                <span class="current-user-label" id="header-current-user-label"></span>',
'                <button type="button" class="btn btn-switch-profile" id="header-btn-switch-profile">Сменить профиль</button>',
'              </div>'
    );
}

fs.writeFileSync('public/index.html', lines.join('\n'), 'utf8');
