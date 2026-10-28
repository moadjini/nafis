// Makes this project's .env.local win over same-named variables that are set
// globally on the machine (for example a NEXT_PUBLIC_SUPABASE_URL left over
// from another project). Next.js and dotenv normally let real environment
// variables take precedence, which would silently connect Nafis to the wrong
// Supabase project. Only keys present in .env.local are touched, and a warning
// names each overridden key (never its value). Deployments that configure
// variables in their hosting dashboard (no .env.local) are unaffected.

const fs = require("node:fs");
const path = require("node:path");
const dotenv = require("dotenv");

function applyLocalEnv(root = __dirname) {
  const file = path.join(root, ".env.local");
  if (!fs.existsSync(file)) return [];
  const parsed = dotenv.parse(fs.readFileSync(file));
  const overridden = [];
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] !== undefined && process.env[key] !== value) overridden.push(key);
    process.env[key] = value;
  }
  if (overridden.length > 0) {
    console.warn(
      `[nafis] .env.local overrides machine-level environment variable(s): ${overridden.join(", ")}. ` +
        "Remove them from your system environment if they belong to another project.",
    );
  }
  return overridden;
}

module.exports = { applyLocalEnv };
