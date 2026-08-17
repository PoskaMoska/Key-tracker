const fs = require("fs");

let server = fs.readFileSync("server.js", "utf8");
server = server.replace("{ id: 2, name: 'Пользователь', phone: '', isAdmin: false, passwordHash: userHash }", "");
fs.writeFileSync("server.js", server, "utf8");

let userModel = fs.readFileSync("src/db/models/User.js", "utf8");
userModel = userModel.replace("{ name: 'Админ', password: 'admin123', isAdmin: true },\n", "");
userModel = userModel.replace("{ name: 'Админ', password: 'admin123', isAdmin: true },\r\n", "");
userModel = userModel.replace("{ name: 'Обычный Пользователь', password: 'user123', isAdmin: false }", "");
fs.writeFileSync("src/db/models/User.js", userModel, "utf8");
