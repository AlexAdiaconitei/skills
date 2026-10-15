#!/usr/bin/env node
// Mirrors the third-party skills listed in vendor.json into skills/<name>/.
//
// For each entry it asks GitHub for the latest commit touching the upstream
// path. If that commit differs from the recorded sha, the folder is replaced
// with a fresh sparse checkout. A skill whose upstream repo or path is gone is
// never deleted: the local copy stays and the problem is reported.
//
// Writes a Markdown report to $VENDOR_REPORT (if set) and `problems=true|false`
// to $GITHUB_OUTPUT (if set). Exits 0 unless the script itself breaks.
//
// Requires: node >= 18, git, gh (authenticated, or GH_TOKEN set).

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(root, "vendor.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...opts }).trim();

const updated = [];
const problems = [];

for (const skill of manifest.skills) {
  const dest = path.join(root, "skills", skill.name);
  const source = `https://github.com/${skill.repo}/tree/${skill.ref}/${skill.path}`;
  try {
    const commit = latestCommit(skill);
    if (!commit) {
      problems.push({ skill, source, kind: "missing", detail: `Path \`${skill.path}\` not found in \`${skill.repo}@${skill.ref}\`.` });
      continue;
    }
    if (commit.sha === skill.sha && fs.existsSync(dest)) {
      console.log(`= ${skill.name} up to date (${commit.sha.slice(0, 7)})`);
      continue;
    }
    mirror(skill, commit, dest, source);
    updated.push({ skill, from: skill.sha, to: commit.sha });
    skill.sha = commit.sha;
    console.log(`+ ${skill.name} -> ${commit.sha.slice(0, 7)}`);
  } catch (err) {
    const msg = String(err.stderr || err.message || err).trim();
    const kind = /404|Not Found/i.test(msg) ? "missing" : "error";
    problems.push({ skill, source, kind, detail: msg.split("\n").slice(0, 5).join("\n") });
    console.error(`! ${skill.name}: ${kind}: ${msg}`);
  }
}

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
writeReport();

function latestCommit(skill) {
  const out = run("gh", [
    "api",
    `repos/${skill.repo}/commits?path=${encodeURIComponent(skill.path)}&sha=${encodeURIComponent(skill.ref)}&per_page=1`,
    "--jq",
    ".[0] | select(.) | {sha: .sha, date: .commit.committer.date}",
  ]);
  return out ? JSON.parse(out) : null;
}

function mirror(skill, commit, dest, source) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vendor-"));
  try {
    run("git", ["clone", "--quiet", "--depth", "1", "--filter=blob:none", "--no-checkout",
      "--branch", skill.ref, `https://github.com/${skill.repo}.git`, tmp]);
    const sparse = [`/${skill.path}/`];
    if (skill.license) sparse.push(`/${skill.license}`);
    run("git", ["-C", tmp, "sparse-checkout", "set", "--no-cone", ...sparse]);
    run("git", ["-C", tmp, "checkout", "--quiet"]);

    const src = path.join(tmp, ...skill.path.split("/"));
    if (!fs.existsSync(path.join(src, "SKILL.md"))) {
      throw new Error(`No SKILL.md in ${skill.repo}/${skill.path}; refusing to replace local copy.`);
    }

    fs.rmSync(dest, { recursive: true, force: true });
    fs.cpSync(src, dest, { recursive: true });

    const hasLicense = fs.readdirSync(dest).some((f) => /^(LICEN[CS]E|COPYING)/i.test(f));
    if (!hasLicense && skill.license) {
      fs.copyFileSync(path.join(tmp, ...skill.license.split("/")), path.join(dest, "LICENSE"));
    }

    fs.writeFileSync(path.join(dest, "UPSTREAM.md"), [
      "# Upstream",
      "",
      "This skill is a mirror of a third-party skill. Do not edit it here:",
      "`scripts/sync-vendor.mjs` overwrites this folder whenever upstream changes.",
      "",
      `- Source: ${source}`,
      `- Commit: [\`${commit.sha.slice(0, 7)}\`](https://github.com/${skill.repo}/commit/${commit.sha}) (${commit.date.slice(0, 10)})`,
      `- License: see \`LICENSE\` in this folder`,
      "",
    ].join("\n"));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function writeReport() {
  const lines = [];
  if (problems.length) {
    lines.push("The weekly vendor sync could not refresh these skills. Their last good copy is still in `skills/` and was not touched.", "");
    for (const p of problems) {
      lines.push(`### \`${p.skill.name}\` — ${p.kind === "missing" ? "upstream missing" : "sync error"}`, "",
        `Source: ${p.source}`, "", "```", p.detail, "```", "");
    }
    lines.push("If the skill moved, update its `repo`/`path` in `vendor.json`. If it is gone for good, the local copy can stay as is, or be removed from `vendor.json` to freeze it.");
  }
  const report = lines.join("\n");
  if (process.env.VENDOR_REPORT) fs.writeFileSync(process.env.VENDOR_REPORT, report);
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `problems=${problems.length > 0}\nupdated=${updated.map((u) => u.skill.name).join(",")}\n`);
  }
  console.log(`\n${updated.length} updated, ${problems.length} problem(s).`);
}
