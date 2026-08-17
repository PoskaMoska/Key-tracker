const fs = require('fs');
let c = fs.readFileSync('public/app.js', 'utf8');
const customAlertCode = \
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
  
  const closeAlert = () => {
    if (modal) modal.style.display = 'none';
  };
  
  if (closeAlertBtn) closeAlertBtn.addEventListener('click', closeAlert);
  if (okAlertBtn) okAlertBtn.addEventListener('click', closeAlert);
});
\;
c = customAlertCode + '\n' + c;
fs.writeFileSync('public/app.js', c);
