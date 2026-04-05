const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

// Run bunchee
execSync("bunchee", { stdio: "inherit" });

// Copy styles.css to dist
const src = path.join(__dirname, "src", "styles.css");
const dest = path.join(__dirname, "dist", "styles.css");

if (fs.existsSync(src)) {
	fs.copyFileSync(src, dest);
	console.log("styles.css copied to dist/");
} else {
	console.warn("WARNING: src/styles.css not found, skipping copy");
}
