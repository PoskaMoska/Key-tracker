import re

with open('public/app.js', 'r', encoding='utf-8') as f:
    c = f.read()

# 1. Fix btnTake
c = re.sub(
    r"const name = isAdmin\(\)\s*\? personName\.value\s*: String\(currentUser && currentUser\.name \? currentUser\.name : ''\)\.trim\(\);",
    "const name = String(currentUser && currentUser.name ? currentUser.name : '').trim();",
    c
)

# 2. Fix updatePersonSelectVisibility
c = re.sub(
    r"function updatePersonSelectVisibility\(\) \{[\s\S]*?field\.style\.display = 'none';\s*\}",
    "function updatePersonSelectVisibility() {\n  if (!personName) return;\n  const field = personName.closest('.field');\n  if (!field) return;\n  field.style.display = 'none';\n}",
    c
)

# 3. Add Alert override
alert_override = """// Custom Alert Override
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

"""

c = alert_override + c

with open('public/app.js', 'w', encoding='utf-8') as f:
    f.write(c)

