import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const encoder = new TextEncoder();

async function pbkdf2(password: string, salt: Uint8Array, iterations = 100_000) {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    keyMaterial,
    256
  );
  return new Uint8Array(bits);
}

function hex(bytes: Uint8Array) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt);
  return `pbkdf2$100000$${hex(salt)}$${hex(hash)}`;
}

function randomId(prefix = "u") {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return `${prefix}_${hex(bytes)}`;
}

function sqlEscape(s: string) {
  return s.replace(/'/g, "''");
}

const [, , email, password, whereArg] = process.argv;
if (!email || !password) {
  console.error("Usage: npm run create-user -- <email> <password> [--remote]");
  process.exit(1);
}

const remote = whereArg === "--remote";
const hash = await hashPassword(password);
const id = randomId();
const sql = `INSERT INTO users (id, email, password_hash, created_at) VALUES ('${sqlEscape(id)}', '${sqlEscape(email.toLowerCase())}', '${sqlEscape(hash)}', ${Date.now()});\n`;

const dir = mkdtempSync(path.join(tmpdir(), "sc-seed-"));
const file = path.join(dir, "seed.sql");
writeFileSync(file, sql, "utf8");

const args = [
  "wrangler",
  "d1",
  "execute",
  "social_command",
  remote ? "--remote" : "--local",
  "--file",
  file,
];
execFileSync("npx", args, { stdio: "inherit" });

console.log(`User created: ${email} (id=${id})`);
