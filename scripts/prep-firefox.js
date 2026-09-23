const fs = require("fs");
const path = require("path");

const outDir = "dist-firefox";
const files = ["background.js", "content.js", "popup.html", "popup.js", "popup.css", "LICENSE"];

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir);

for (const f of files) {
  fs.copyFileSync(f, path.join(outDir, f));
}

fs.copyFileSync("manifest.firefox.json", path.join(outDir, "manifest.json"));

console.log(`Staged ${files.length + 1} files in ${outDir}/`);