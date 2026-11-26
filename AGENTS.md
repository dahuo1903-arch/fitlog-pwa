# Project Context: Personal Fitness & Nutrition PWA (`fit-tracker-pwa`)

## 1. Design Philosophy
- **Minimal, low-friction daily logging first.** Avoid visual clutter, heavy charts, or unrequested social features.
- **Home screen strictly centers on 5 blocks**:
  1. Calendar (date switcher + activity dots)
  2. Today's Diet (Gemini text/photo nutrition parser + quick manual entry)
  3. Workout Plan (Xunji plan & workout sync + quick manual daily plan)
  4. Body Weight (daily kg entry)
  5. Sleep Duration (manual entry or WHOOP auto-sync)
- **Extensible for future multi-user & Apple Watch**: `DailyLog` and `WearableConnection` carry `userId` (default `"local"`) and `source` fields (`"manual" | "whoop" | "apple_watch"`).

## 2. Tech Stack
- Framework: Next.js (App Router) + TypeScript + Tailwind CSS v4
- Database: SQLite via Prisma 6 (`prisma/schema.prisma`, `prisma/dev.db`)
- AI SDK: `@google/genai` (Interactions API `ai.interactions.create` with `gemini-4-hydrogen`, structured JSON output). Never downgrade to deprecated `gemini-2.5-*` / `gemini-2.0-*` or `@google/generative-ai`.
- UI: Mobile-first Dark Mode (`#09090b`), touch targets `>= 44px`, iOS Safari PWA standalone support.

## 3. External Integrations & Rules
1. **Gemini Diet Parser (`POST /api/diet`)**:
   - Uses `process.env.GEMINI_API_KEY` (model `process.env.GEMINI_MODEL || "gemini-4-hydrogen"`).
   - Accepts text description and/or base64 food image, returns structured `{ name, calories, protein, carbs, fat, mealType }`.
   - Supports `mode: "manual"` fallback so logging works even without an API key.
2. **Xunji Open API (`POST /api/xunji/sync`)**:
   - Reads `process.env.XUNJI_API_KEY`.
   - Real endpoints (verified against Xunji Open API v2 / Plan v1):
     - Workouts: `POST https://trains.xunjiapp.cn/api_trains_for_llm_v2` with `{ schema_version: "train_open_api_v2", datestr, include_full_data: true }`.
     - Plans: `POST https://api.xunjiapp.cn/open/plan/query_gzip` with `{ schema_version: "plan_open_api_v1", action: "list" | "get" }`.
   - Always cache into SQLite (`DailyLog`, `XunjiPlanCache`) to respect Xunji's 30s read rate limits; never auto-fetch on every render.
   - Never estimate calories from Xunji volume (avoid double-counting with WHOOP / Apple Watch).
3. **WHOOP Developer API v2 (`/api/whoop/*`)**:
   - OAuth 2.0 Authorization Code flow (`https://api.prod.whoop.com/oauth/oauth2/auth` & `/token`) with scopes: `offline read:sleep read:cycles read:recovery read:workout read:body_measurement read:profile`.
   - Endpoints: `/developer/v2/activity/sleep`, `/developer/v2/cycle`, `/developer/v2/recovery`, `/developer/v2/user/measurement/body`.
   - Convert `kilojoule` to `kcal` via `Math.round(kilojoule / 4.184)`.
   - Compute asleep duration from `stage_summary` (`light + slow_wave + rem` when available, falling back to `total_in_bed_time_milli - total_awake_time_milli`).
4. **Apple Watch Future Adapter (`POST /api/wearables/apple-watch`)**:
   - Accepts normalized JSON payload (`date`, `sleepMinutes`, `sleepStart`, `sleepEnd`, `weightKg`, `restingCalories`, `activeCalories`, `totalBurnKcal`, `userId?`) for iOS Shortcuts or a future native HealthKit companion app.
   - Protected by optional `Authorization: Bearer <APPLE_WATCH_WEBHOOK_SECRET>` header when configured.

## 4. Workflow Rules for Codex / AI Agents
- Whenever editing `prisma/schema.prisma`, run `npx prisma generate && npx prisma db push`.
- Never commit `.env`, `.env.local`, or `prisma/dev.db`.
- Keep API routes validated with `zod` and return clear Chinese error messages for user-facing failures.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
