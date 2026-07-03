const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const failures = [];

const ignoredDirs = new Set([".git", ".agents", ".codex", "node_modules"]);
const ignoredExtensions = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".pdf", ".zip"]);
const ignoredFiles = new Set(["server-4174.out.log", "server-4174.err.log"]);

const secretPatterns = [
  {
    label: "chave privada PEM",
    pattern: /-----BEGIN (RSA |EC |OPENSSH |DSA |)?PRIVATE KEY-----/,
  },
  {
    label: "token OpenAI",
    pattern: /\bsk-(proj-)?[A-Za-z0-9_-]{32,}\b/,
  },
  {
    label: "token GitHub",
    pattern: /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{30,}\b/,
  },
  {
    label: "access key AWS",
    pattern: /\b(AKIA|ASIA)[A-Z0-9]{16}\b/,
  },
  {
    label: "chave Google API",
    pattern: /\bAIza[0-9A-Za-z_-]{35}\b/,
  },
  {
    label: "chave Stripe",
    pattern: /\b(?:sk|rk)_(?:live|test)_[0-9A-Za-z]{24,}\b/,
  },
  {
    label: "atribuicao suspeita de segredo",
    pattern: /\b(?:api[_-]?key|secret|token|password|senha|client[_-]?secret)\b\s*[:=]\s*["'][^"']{16,}["']/i,
  },
];

function fail(message) {
  failures.push(message);
}

function shouldSkip(filePath) {
  const relative = path.relative(root, filePath);
  const parts = relative.split(path.sep);
  if (parts.some((part) => ignoredDirs.has(part))) return true;
  if (ignoredFiles.has(path.basename(filePath))) return true;
  return ignoredExtensions.has(path.extname(filePath).toLowerCase());
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const filePath = path.join(dir, entry.name);
    if (shouldSkip(filePath)) return [];
    if (entry.isDirectory()) return walk(filePath);
    return [filePath];
  });
}

function readText(filePath) {
  const buffer = fs.readFileSync(filePath);
  if (buffer.includes(0)) return "";
  return buffer.toString("utf8");
}

function checkGitignore() {
  const gitignorePath = path.join(root, ".gitignore");
  const content = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, "utf8") : "";
  [".env", ".env.*"].forEach((snippet) => {
    if (!content.includes(snippet)) {
      fail(`.gitignore deve bloquear ${snippet}.`);
    }
  });
}

function checkEnvFiles() {
  walk(root)
    .map((filePath) => path.relative(root, filePath).replace(/\\/g, "/"))
    .filter((relative) => relative === ".env" || relative.startsWith(".env."))
    .forEach((relative) => fail(`Arquivo de ambiente nao deve ficar no projeto publico: ${relative}.`));
}

function checkSecrets() {
  walk(root).forEach((filePath) => {
    const relative = path.relative(root, filePath).replace(/\\/g, "/");
    const content = readText(filePath);
    if (!content) return;

    secretPatterns.forEach((check) => {
      const match = content.match(check.pattern);
      if (match) {
        fail(`${relative}: possivel ${check.label} encontrado perto de "${match[0].slice(0, 18)}...".`);
      }
    });
  });
}

checkGitignore();
checkEnvFiles();
checkSecrets();

if (failures.length) {
  console.error(`Security check failed:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

console.log("Security check passed: nenhum segredo obvio encontrado no projeto publico.");
