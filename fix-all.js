const fs = require('fs');
let c = fs.readFileSync('public/app.js', 'utf8');

// 1. Fix btnTake
c = c.replace(/const name = isAdmin\(\)\s*\? personName\.value\s*: String\(currentUser && currentUser\.name \? currentUser\.name : ''\)\.trim\(\);/, "const name = String(currentUser && currentUser.name ? currentUser.name : '').trim();");

// 2. Fix updatePersonSelectVisibility
c = c.replace(/function updatePersonSelectVisibility\(\) \{\s*if \(!personName\) return;\s*const field = personName\.closest\('\.field'\);\s*if \(!field\) return;\s*if \(isAdmin\(\)\) \{\s*field\.style\.display = '';\s*return;\s*\}\s*field\.style\.display = 'none';\s*\}/, "function updatePersonSelectVisibility() {\n  if (!personName) return;\n  const field = personName.closest('.field');\n  if (!field) return;\n  field.style.display = 'none';\n}");

// 3. Add Custom Alert Override
const alertOverride = \
// Custom Alert Override
window.originalAlert = window.alert;
window.alert = function(message) {
  const modal = document.getElementById('custom-alert-modal');
  const msgEl = document.getElementById('custom-alert-message');
  if (modal && msgEl) {
    msgEl.textContent = message;
    modal.style.display = 'flex';
  } else {
    window.originalAlert(message);
  }
};

document.addEventListener('DOMContentLoaded', () => {
  const closeAlertBtn = document.getElementById('close-custom-alert-modal');
  const okAlertBtn = document.getElementById('custom-alert-ok-btn');
  const modal = document.getElementById('custom-alert-modal');
  const closeAlert = () => { if (modal) modal.style.display = 'none'; };
  if (closeAlertBtn) closeAlertBtn.addEventListener('click', closeAlert);
  if (okAlertBtn) okAlertBtn.addEventListener('click', closeAlert);
});
\;

c = alertOverride + '\n\n' + c;
fs.writeFileSync('public/app.js', c);
