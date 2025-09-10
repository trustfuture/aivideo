# Repository Guidelines

## Project Structure & Module Organization
- `app/`: FastAPI backend (ASGI). Key modules: `controllers/`, `services/`, `models/`, `config/`, `utils/`, `router.py`, `asgi.py`.
- `webui/`: Streamlit UI (`Main.py`, `.streamlit/`, `i18n/`).
- `resource/`: Fonts (`fonts/`) and music (`songs/`).
- `storage/`: Task outputs and caches (ignored by Git). Do not commit contents.
- `docs/`: Architecture and usage notes.
- `test/`: `unittest` tests mirroring `app/services/`.
- Entrypoints: API `main.py` (Uvicorn), Web UI `webui.sh` / `webui.bat`.

## Build, Test, and Development Commands
- Setup (recommended)
  - `python -m venv .venv && . .venv/bin/activate`
  - `pip install -r requirements.txt`
- Run API (FastAPI/Uvicorn)
  - `python main.py` → serves docs at `http://127.0.0.1:8080/docs`.
- Run Web UI (Streamlit)
  - `sh webui.sh` (or `webui.bat` on Windows) → `http://0.0.0.0:8501`.
- Docker
  - `docker-compose up` → API `:8080`, Web UI `:8501`.
- Tests
  - `python -m unittest discover -s test`

## Coding Style & Naming Conventions
- Python 3.11; follow PEP 8 with 4-space indent and type hints where practical.
- Names: files/functions `snake_case`, classes `PascalCase`, constants `UPPER_SNAKE`.
- Logging via `loguru.logger`; avoid `print` in library code.
- Keep modules small and focused; prefer pure, testable `services/*` functions.

## Testing Guidelines
- Framework: `unittest`.
- Location: place files under `test/` mirroring package paths (e.g., `test/services/test_video.py`).
- Naming: files `test_*.py`, classes `Test*`, methods `test_*`.
- Run: `python -m unittest test.services.test_video.TestVideoService`.
- Mock external I/O (LLMs, TTS, network, filesystem); use `test/resources/` for fixtures.

## Commit & Pull Request Guidelines
- Use Conventional Commit prefixes: `feat:`, `fix:`, `perf:`, `refactor:`, `docs:`, `chore:`.
- Commits should be small and scoped; include rationale when behavior changes.
- PRs must include: summary, motivation, test coverage notes, run instructions, and screenshots for UI changes.
- Link related issues and note config impacts (e.g., `config.toml` keys).

## Frontend (@web) Guidelines
- Location: `web/` (Next.js 14, App Router, TypeScript, Tailwind v4, shadcn‑ui).
- Commands (run in `web/`): `pnpm install`, `pnpm dev`, `pnpm build`, `pnpm lint`.
- Env: copy `.env.example` → `.env.local`; set `NEXT_PUBLIC_API_BASE` (default `http://localhost:8080/api`).
- Structure: `app/` pages/layout, `components/ui/` shadcn components, `lib/` API + schemas.
- Styling: Tailwind v4 via `@import "tailwindcss";` in `app/globals.css`; utility `cn()` in `lib/utils.ts` with `tailwind-merge`.
- Components: files in `components/ui/*` use lower-case filenames, exported React components in `PascalCase`.
- Data fetching: prefer TanStack Query in client components; keep fetchers in `lib/` and type with `zod`.
- UI kit: add components with `pnpm dlx shadcn-ui@latest add button input select dialog` (respects `components.json`).
- API paths: backend is served at `/api/v1/*`; the web app calls `${NEXT_PUBLIC_API_BASE}/v1/...`.

## Security & Configuration Tips
- Never commit secrets. Copy `config.example.toml` → `config.toml` locally and set API keys (LLMs, Pexels/Pixabay), `ffmpeg`/`ImageMagick` paths.
- Large artifacts live in `storage/`; clean locally if space is tight.
- See `docs/video-architecture.md` for deeper module and dataflow details.
