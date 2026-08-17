const fs = require("fs");
let html = fs.readFileSync("public/index.html", "utf8");

// Remove from header
const block = `      <div class="header-profile-actions" style="display: flex; align-items: center; gap: 8px; display: none;" id="header-profile-actions">\n        <span class="current-user-label" id="header-current-user-label"></span>\n        <button type="button" class="btn btn-switch-profile" id="header-btn-switch-profile">Сменить профиль</button>\n      </div>\n`;
if(html.includes(block)) {
    html = html.replace(block, "");
} else {
    console.log("Could not find exact block in header!");
}

// Add under buttons
const target = `              <div class="buttons">
                <button type="button" class="btn btn-take" id="btn-take">Взять</button>
                <button type="button" class="btn btn-take" id="toggle-history-btn">История</button>
                <button type="button" class="btn btn-manage admin-only" id="btn-manage-people" title="Управление сотрудниками">??</button>
              </div>`;
              
const newBlock = `              <div class="buttons">
                <button type="button" class="btn btn-take" id="btn-take">Взять</button>
                <button type="button" class="btn btn-take" id="toggle-history-btn">История</button>
                <button type="button" class="btn btn-manage admin-only" id="btn-manage-people" title="Управление сотрудниками">??</button>
              </div>
              <div class="header-profile-actions" style="display: none; align-items: center; justify-content: center; gap: 8px; width: 100%; margin-top: 0.75rem;" id="header-profile-actions">
                <span class="current-user-label" id="header-current-user-label"></span>
                <button type="button" class="btn btn-switch-profile" id="header-btn-switch-profile">Сменить профиль</button>
              </div>`;
              
if (html.includes(target)) {
    html = html.replace(target, newBlock);
} else {
    console.log("Could not find buttons target!");
}

fs.writeFileSync("public/index.html", html, "utf8");
console.log("Done index.html");

