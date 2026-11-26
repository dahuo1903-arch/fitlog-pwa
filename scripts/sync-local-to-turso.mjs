#!/usr/bin/env node
/**
 * 将 Prisma Schema 建表语句与本地 prisma/dev.db 全部历史数据幂等同步至云端 Turso (libSQL)。
 *
 * 用法：
 *   TURSO_DATABASE_URL="libsql://..." TURSO_AUTH_TOKEN="..." npm run db:sync-turso
 * 也可先将上述两个变量写入 .env 后直接运行 npm run db:sync-turso。
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { createClient } from "@libsql/client";

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = val;
    }
  }
}

loadEnvFile(path.resolve(".env"));
loadEnvFile(path.resolve(".env.local"));

const tursoUrl = process.env.TURSO_DATABASE_URL?.trim();
const tursoToken = process.env.TURSO_AUTH_TOKEN?.trim();

if (!tursoUrl) {
  console.error("缺少 TURSO_DATABASE_URL，请先配置云端 Turso 数据库连接地址。");
  process.exit(1);
}

const remote = createClient({
  url: tursoUrl,
  authToken: tursoToken || undefined,
});

function splitSqlStatements(sql) {
  const withoutComments = sql
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");

  return withoutComments
    .split(/;\s*(?:\r?\n|$)/)
    .map((s) => s.trim())
    .filter(Boolean);
}

async function applySchema() {
  console.log("1/2 正在基于 prisma/schema.prisma 同步云端表结构...");
  const ddl = execSync(
    "npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script",
    { encoding: "utf8" }
  );

  const statements = splitSqlStatements(ddl).map((stmt) =>
    stmt
      .replace(/^CREATE TABLE\s+/i, "CREATE TABLE IF NOT EXISTS ")
      .replace(/^CREATE UNIQUE INDEX\s+/i, "CREATE UNIQUE INDEX IF NOT EXISTS ")
      .replace(/^CREATE INDEX\s+/i, "CREATE INDEX IF NOT EXISTS ")
  );

  if (statements.length === 0) {
    throw new Error("未从 prisma/schema.prisma 生成任何建表语句");
  }

  for (const stmt of statements) {
    await remote.execute(stmt);
  }
  console.log(`   ✓ 已幂等同步 ${statements.length} 条建表/索引语句`);
}

async function syncLocalRows() {
  const localDbPath = path.resolve("prisma/dev.db");
  if (!fs.existsSync(localDbPath)) {
    console.log("2/2 未检测到本地 prisma/dev.db，跳过历史数据迁移。");
    return;
  }

  console.log("2/2 正在迁移本地 prisma/dev.db 历史数据到云端 Turso...");
  const local = createClient({ url: `file:${localDbPath}` });

  const tables = [
    "DailyLog",
    "MealItem",
    "WearableConnection",
    "XunjiPlanCache",
  ];

  for (const table of tables) {
    const res = await local.execute(`SELECT * FROM "${table}"`);
    if (res.rows.length === 0) {
      console.log(`   - ${table}: 0 条记录，跳过`);
      continue;
    }

    const columns = res.columns;
    const quotedCols = columns.map((c) => `"${c}"`).join(", ");
    const placeholders = columns.map(() => "?").join(", ");
    const sql = `INSERT OR REPLACE INTO "${table}" (${quotedCols}) VALUES (${placeholders})`;

    const batch = res.rows.map((row) => ({
      sql,
      args: columns.map((col) => row[col] ?? null),
    }));

    await remote.batch(batch, "write");
    console.log(`   ✓ ${table}: 已同步 ${res.rows.length} 条记录`);
  }

  local.close();
}

try {
  await applySchema();
  await syncLocalRows();
  console.log("全部同步完成！云端 FitLog 数据库已就绪。");
} catch (err) {
  console.error("同步失败：", err);
  process.exit(1);
} finally {
  remote.close();
}
