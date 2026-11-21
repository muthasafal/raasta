# Raasta build contracts

## Architecture decision (binding)
- **apps/web**: Vite + React 19 + TS + Tailwind 4, prerendered static site for STATIC routes only:
  `/`, `/help`, `/help/:category`, `/offices`, `/state/:code`, `/legal-aid`, `/emergency`, `/feedback`, `/about`, `/about/data`, `/privacy`, `/terms`, `/disclaimer`, 404.
  Prerendered once per locale (`/`, `/mr/`, ...). Every form is a plain `<form method="post" action="/r/...">`. JS only enhances.
- **apps/api**: Cloudflare Worker, Hono 4. Serves `/api/*` (JSON) and `/r/*` (server-rendered HTML with **Hono JSX**) for ALL dynamic pages:
  `/r/ask` (POST prompt -> intake -> redirect to route), `/r/flow/:dispute/:step` (guided questions, GET+POST), `/r/route/:token` (result + action centre),
  `/r/guide/:platformId`, `/r/doc/:template` (GET form, POST -> PDF or print HTML), `/r/label` (postal labels PDF), `/r/offices`, `/r/directions`,
  `/r/legal-aid` (POST screener), `/r/feedback`, `/r/system-request`, `/r/submitted/:id`, `/r/chat` (no-JS chat fallback, one Q/A per post).
- **Shared look**: one hand-written stylesheet `apps/web/public/styles/raasta.css` (tokens + component classes: `.btn`, `.btn-primary`, `.card`, `.chip`, `.field`, `.wave`, `.stepper`, `.checklist`, `.door-street`, layout helpers). Worker HTML links `/styles/raasta.css` (same origin, served by Pages; in dev, Vite serves it and proxies `/api` + `/r` to `wrangler dev` on 8787). React pages may also use Tailwind utilities; Worker JSX uses only `raasta.css` classes.
- **Shared layout**: Worker uses `apps/api/src/views/Layout.tsx` (header with logo, language switch form, emergency link; footer with disclaimer + attributions). It must look the same as the React shell.

## Packages (workspace names)
| Package | Name | Entry | Notes |
|---|---|---|---|
| packages/config | `@raasta/config` | `src/brand.ts` | APP_NAME, LOCALES, FLAGS |
| packages/data | `@raasta/data` | `src/index.ts` | exports typed JSON: `platforms`, `disputes`, `officesPune`, `legalAid`, `timers`, `states`, `platformInsights`; `src/types.ts` (contract), `src/schemas.ts` (zod) |
| packages/rules | `@raasta/rules` | `src/index.ts` | `route(slots, geo)`, `guardrails`, `legalAidCheck`, `liveTimers`, `redact`, `signToken/verifyToken` (Web Crypto HMAC, works in Worker + Node) ; `src/types.ts` (contract) |
| packages/i18n | `@raasta/i18n` | `src/index.ts` | `locales/<lang>.json` flat keys, `t(lang,key,vars)`, `LANG_META` (native name, dir, font family) |
| packages/docs-gen | `@raasta/docs-gen` | `src/index.ts` | `buildDoc(templateId, slots, user, office, lang): DocModel`, `renderPdf(DocModel): Uint8Array`, `renderPrintHtml(DocModel): string`, `renderLabels(...)`, `buildMailto/buildGmail/buildOutlook` |

TS imports use `@raasta/<pkg>` and subpaths like `@raasta/rules/types` (package.json `exports`: `".": "./src/index.ts", "./*": "./src/*.ts"`). No build step for packages: consumers (Vite, wrangler/esbuild, vitest) compile TS source directly.

## i18n keys
Flat dotted keys in `packages/i18n/locales/en.json`. Rule-engine keys: `step.*`, `why.*`, `warn.*`, `legalaid.*`, `doc.*`, `timer.*`. UI: `ui.*`. Disputes: `dispute.<id>.title`, `dispute.<id>.short`. Any change that introduces a key adds it to `en.json` in the same change.

## Global rules
No em dashes (U+2014) anywhere. No emoji icons. No fake numbers. Never invent URLs, fees, phones, emails, deadlines: they come only from `packages/data`. Never link edaakhil.nic.in. No iframes of government portals. Light mode only. Disclaimer on every result page: "Raasta gives procedural guidance based on public government rules. It is not legal advice."
