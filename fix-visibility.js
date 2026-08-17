const fs = require('fs');
let c = fs.readFileSync('public/app.js', 'utf8');
c = c.replace(/function updatePersonSelectVisibility\(\) \{\s*if \(!personName\) return;\s*const field = personName\.closest\('\.field'\);\s*if \(!field\) return;\s*if \(isAdmin\(\)\) \{\s*field\.style\.display = '';\s*return;\s*\}\s*field\.style\.display = 'none';\s*\}/, "function updatePersonSelectVisibility() {\n  if (!personName) return;\n  const field = personName.closest('.field');\n  if (!field) return;\n  field.style.display = 'none';\n}");
fs.writeFileSync('public/app.js', c);
