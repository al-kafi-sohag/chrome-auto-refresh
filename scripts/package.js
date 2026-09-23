const fs = require("fs");
const path = require("path");
const archiver = require("archiver"); // npm i -D archiver

const target = process.argv[2]; // "chrome" | "firefox"
const files = ["background.js", "content.js", "popup.html", "popup.js", "popup.css", "LICENSE"];
const outDir = "dist";
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

const output = fs.createWriteStream(path.join(outDir, `${target}.zip`));
const archive = archiver("zip", { zlib: { level: 9 } });
archive.pipe(output);

for (const f of files) archive.file(f, { name: f });

const manifestSrc = target === "firefox" ? "manifest.firefox.json" : "manifest.json";
archive.file(manifestSrc, { name: "manifest.json" });

archive.finalize();