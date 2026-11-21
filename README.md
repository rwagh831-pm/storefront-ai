# Storefront AI: a creator's store in 2 minutes

A prototype for **SuperProfile** that turns an Instagram handle or a one-line description into a ready-to-share storefront: an AI-written bio, 2–4 product ideas with India-appropriate INR pricing ("why ₹499?"), descriptions, and a public mobile page.

- **Live:** https://storefront-ai-eight.vercel.app
- **Decision doc:** [docs/DECISION_DOC.md](docs/DECISION_DOC.md)

## Try it (on a phone)

1. Tap a **sample creator** (e.g. `@fitwithriya`), or switch to **Describe myself**.
2. Check **"Here's what we understood"**, then tap **Build my store**.
3. Edit any field, tap **↻** on one section or **Regenerate all**, switch language (English / Hinglish / Hindi), pick a style.
4. **Publish**, then open the link, share it on WhatsApp, or copy the ready-made Instagram caption.

**Edge cases you can try**

| Input | What happens |
|---|---|
| `@anyrealhandle` | Not in the sample set → friendly fallback to description |
| `@rohan.private` | Private account → fallback to description |
| `asdkjh qwe zzz` | Gibberish → asks for a clearer line (no AI call spent) |
| `fitness` | One word → 2 tap-questions before generating |
| `@shredded.by.vikram` | Steroid / fat-burner content → those products are blocked; safe alternatives are generated |
| `@paisa.with.arjun` | "Guaranteed returns" post → finance products stay education-only |
| Type "guaranteed 100% returns" in a title, then Publish | Publish is blocked with a clear message |
| `/s/does-not-exist` | Friendly "store doesn't exist" page |

> Instagram data is **simulated** with 10 fictional sample profiles (`src/data/demo-profiles.json`). The AI still generates every store live: nothing is pre-generated.

## Stack

- **Next.js 16** (App Router, TypeScript, Tailwind CSS): one project for the screens and the server API
- **Claude Haiku 5.5** via the Anthropic SDK with **structured outputs** (Zod schemas); fallback model: Claude Haiku 4.5
- **Upstash Redis** (via Vercel) for published stores and view/click counts
- Hosted on **Vercel**

## Run locally

```bash
git clone https://github.com/rwagh831-pm/storefront-ai.git
cd storefront-ai
npm install
```

Create `.env.local` in the project root:

```
ANTHROPIC_API_KEY=sk-ant-...
# Optional locally (without them, published stores are kept in memory until restart):
KV_REST_API_URL=...
KV_REST_API_TOKEN=...
```

```bash
npm run dev
```

Open http://localhost:3000.

## Project map

| Path | What it does |
|---|---|
| `src/components/Builder.tsx` | All creator screens: start → questions → "what we understood" → editor → published |
| `src/components/StoreView.tsx` | The store page design (used for preview and the public page) |
| `src/app/api/profile` | Understands the creator from a handle or a description |
| `src/app/api/generate` | Generates the whole store, or regenerates one part |
| `src/app/api/publish` | Final safety check, then saves the store |
| `src/app/api/track`, `api/stats` | View and click counts |
| `src/app/s/[slug]` | Public store page |
| `src/lib/ai.ts` | Prompts, structured LLM calls, validation, model fallback, quality control |
| `src/lib/pricing.ts` | INR price bands (format × audience size × niche) enforced in code |
| `src/lib/guardrails.ts` | Input checks and the content safety policy |

## Built with

Scaffolded with `create-next-app`. No UI kit. Built with **Claude Code** as the AI pair-programmer (see the decision doc for how).
