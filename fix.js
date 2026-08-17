const fs = require("fs");
let css = fs.readFileSync("public/styles.css", "utf8");
css = css.replace(/(\.bundle-item \{[^}]+border: 1px solid transparent;)/, "$1\n  flex-wrap: wrap;");
css = css.replace(/(\.bundle-comment-editor \{[\s\S]*?flex-wrap: wrap;)/, "$1\n  width: 100%;\n  margin-top: 0.4rem;\n  box-sizing: border-box !important;");
css = css.replace(/(\.view-bundle-item \.bundle-comment-editor \{[\s\S]*?)flex: 1 1 100%;/, "$1flex: 0 0 100%;\n  width: 100%;");
fs.writeFileSync("public/styles.css", css, "utf8");
