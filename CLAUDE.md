@AGENTS.md

## Workflow

1. Work on one item at a time.
2. Plan first and wait for explicit approval before writing code.
3. After each item, give a checkpoint report: files touched, deviations from design, new dependencies, what to verify.
4. Never proceed to the next item without the user's explicit "next".
5. The design bundle + attached screenshots are the source of truth. On mismatch with existing code, the design wins. If the design needs data the schema lacks, stop and list the mismatches instead of improvising.

## Data access

New features integrate via the backend API (`${EXPO_PUBLIC_API_URL}/api/...`), not direct Supabase reads/writes. Existing direct-Supabase hooks stay as-is until a feature touches them.

## Backend repo (read-only)

The backend is a git clone at `~/Documents/FreshRun/backend` (https://github.com/Fresh-Run/BE). It is READ-ONLY for us — **never push, never commit there**. Source of truth for the API contract: `docs/API_GUIDE.md` in that repo (once it exists) + the running server's `/docs` (Swagger). Always `git pull` the backend repo before planning any integration slice.
