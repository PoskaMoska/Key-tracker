const fs = require('fs');
let c = fs.readFileSync('public/app.js', 'utf8');
c = c.replace(/const name = isAdmin\(\)\s*\? personName\.value\s*: String\(currentUser && currentUser\.name \? currentUser\.name : ''\)\.trim\(\);/, "const name = String(currentUser && currentUser.name ? currentUser.name : '').trim();");
fs.writeFileSync('public/app.js', c);
