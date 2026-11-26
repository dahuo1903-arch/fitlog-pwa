# FitLog

极简、低摩擦的个人健身与饮食记录 **全栈 PWA**（Progressive Web App）—— 支持安装到 iPhone / Android / 桌面主屏幕全屏运行，云端部署后推送代码自动热更新。

## 核心特性

首屏聚焦 **5 大高频日常记录模块**，克制、无冗余图表：

1. **日历**：紧凑一周日历条 + 可展开整月月历，圆点标记每日饮食、训练、体重与睡眠记录。
2. **今日饮食（Gemini AI + 双引擎语音）**：
   - 基于 `@google/genai` Interactions API（默认 `gemini-4-hydrogen`，高峰期自动降级 `gemini-3.5-flash-lite`），一句话自然语言或拍照自动识别热量与蛋白质 / 碳水 / 脂肪；
   - 双引擎中文语音输入：优先浏览器原生实时听写，遇受限自动切换麦克风录音 + Gemini 云端音频转写；
   - 支持一键切换手动极速补录，无 API Key 亦可离线使用。
3. **体重**：并排快录卡片，无当日数据时自动提示最近一次称重参考。
4. **睡眠时间 & WHOOP v2 自动同步**：
   - 完整实现 WHOOP Developer API v2 OAuth 2.0 授权与自动刷新令牌；
   - 按 `cycle_id` 精确对齐主睡眠醒来日、恢复度（Recovery）、当日负荷（Strain）、每日总消耗（`kilojoule / 4.184`）、HRV 与静息心率，优先解析记录原生时区。
5. **健身计划 & 训记 Open API**：
   - 支持手写当日训练主题与可勾选动作清单；
   - 对接训记 Open API v2 / Plan v1，内置 30 秒本地防限频缓存，且不将力量训练容量重复折算成热量（避免与穿戴设备双重计数）。

### 面向自托管与长期迭代的设计
- **完整可安装 PWA**：含 iOS 180px 专用图标、Android 自适应 Maskable 图标、Network-First 热更新 Service Worker 与离线兜底页。
- **30 天个人访问密码锁**：配置 `APP_ACCESS_PIN` 即全局启用 Next.js 16 `proxy.ts` 鉴权与 `/unlock` 解锁页（HttpOnly HMAC Cookie 记住本设备 30 天 + 防爆破限流），本地未配置时自动免锁。
- **双模数据库（本地 SQLite / 云端 Turso libSQL）**：同一份 `prisma/schema.prisma`，本地零配置读写 `prisma/dev.db`，配置 `TURSO_DATABASE_URL` 自动切换 `@prisma/adapter-libsql` 适配 Vercel Serverless，并提供一键建表与历史数据迁移脚本 `npm run db:sync-turso`。
- **多用户 & Apple Watch 预留**：数据表内置 `userId` 与来源字段，已就绪标准化 `POST /api/wearables/apple-watch` 接口（可选 Bearer 密钥保护），方便对接 iPhone 快捷指令或原生 HealthKit 应用。

---

## 技术栈

- **框架**：Next.js 16 (App Router + Turbopack) + React 19 + TypeScript + Tailwind CSS v4
- **数据库**：SQLite / Turso (libSQL) + Prisma 6 (`@prisma/adapter-libsql`)
- **AI**：Google Gemini API (`@google/genai` Interactions API)
- **校验**：Zod

---

## 本地快速启动

```bash
git clone https://github.com/dahuo1903-arch/fitlog-pwa.git
cd fitlog-pwa
cp .env.example .env

npm install
npx prisma generate
npx prisma db push
npm run dev
```

启动后：
- 电脑访问 `http://localhost:3000`
- 同局域网手机可在页面右上角「连接」中查看并复制本机局域网访问地址

---

## 云端自部署（Vercel + Turso，支持推送即热更新）

1. **创建云端数据库**：在 [Turso](https://turso.tech/) 创建免费数据库并生成 Read & Write Token。
2. **初始化表结构（可选同步本地历史数据）**：
   ```bash
   TURSO_DATABASE_URL="libsql://your-db.turso.io" \
   TURSO_AUTH_TOKEN="your-token" \
   npm run db:sync-turso
   ```
3. **导入部署至 Vercel**：
   - 在 [Vercel](https://vercel.com/) 导入本仓库，在 `Environment Variables` 中按需填入以下环境变量：

| 变量名 | 必填 | 说明 |
| --- | --- | --- |
| `DATABASE_URL` | 是 | 固定填 `file:./dev.db`（用于构建期 `prisma generate`） |
| `TURSO_DATABASE_URL` | 云端必填 | Turso 数据库 `libsql://...` 地址 |
| `TURSO_AUTH_TOKEN` | 云端必填 | Turso 读写 Token |
| `APP_ACCESS_PIN` | 强烈推荐 | 个人访问密码锁（留空则免锁；解锁后本设备 30 天免密） |
| `APP_SESSION_SECRET` | 可选 | 会话签名密钥（留空时由 `APP_ACCESS_PIN` 自动派生） |
| `GEMINI_API_KEY` | 可选 | Gemini 饮食解析与语音转写密钥（[Google AI Studio](https://aistudio.google.com/apikey)） |
| `GEMINI_MODEL` | 可选 | 默认 `gemini-4-hydrogen` |
| `XUNJI_API_KEY` | 可选 | 训记 Open API 密钥（`xjllm_...`） |
| `WHOOP_CLIENT_ID` | 可选 | WHOOP Developer 应用 Client ID |
| `WHOOP_CLIENT_SECRET` | 可选 | WHOOP Developer 应用 Client Secret |
| `WHOOP_REDIRECT_URI` | 可选 | 留空将自动按当前访问域名生成 `/api/whoop/callback` |
| `APPLE_WATCH_WEBHOOK_SECRET` | 可选 | 保护 `POST /api/wearables/apple-watch` 的 Bearer 密钥 |

4. **安装到手机主屏幕**：部署完成后，用 iPhone Safari 打开你的 HTTPS 域名 → 输入密码解锁 → 点击底部「分享 → 添加到主屏幕」即可作为独立全屏 App 使用。后续每次推送代码至 `main`，Vercel 自动构建上线，手机重新打开即享最新版本。

---

## Apple Watch 标准化写入接口

`POST /api/wearables/apple-watch` 可直接供 iOS 快捷指令自动化或 HealthKit Bridge 推送数据：

```json
{
  "userId": "local",
  "date": "2026-11-26",
  "sleepMinutes": 455,
  "sleepStart": "23:30",
  "sleepEnd": "07:05",
  "weightKg": 74.2,
  "restingCalories": 1750,
  "activeCalories": 620
}
```

若配置了 `APPLE_WATCH_WEBHOOK_SECRET`，请在请求头附加 `Authorization: Bearer <secret>`。

---

## License

[MIT](./LICENSE)
