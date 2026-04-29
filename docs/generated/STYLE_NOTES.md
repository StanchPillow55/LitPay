# Style Notes - LitPay Documentation

**Source Analysis:** README.md, QUICKSTART.md, FRONTEND_ARCHITECTURE.md

---

## Observed Style Rules

### Headings
- **Emoji prefixes** on H2 headers (e.g., 🎯 Overview, 📋 Features, 🚀 Quick Start)
- H1 for title only; H2-H4 for sections
- `---` horizontal rules between major sections

### Code Blocks
- **Language-tagged** bash blocks for all CLI examples
- Inline backticks for file names, env vars, endpoints
- Multi-line JSON/config shown with full context

### Architecture Diagrams
- ASCII box diagrams using `┌─┐│└─┘` characters
- Flow arrows: `│ ▼ ▶ ─`
- Labels centered inside boxes

### Tables
- Used for: metrics summaries, env vars, API endpoints
- Markdown table syntax with alignment

### Status Indicators
- ✅ for complete/passing
- ❌ for incomplete/failing
- ⚠️ for warnings
- 📋 for todo/planned

### Tone
- **Direct, technical** — no fluff
- Commands are copy-pasteable
- Results shown inline (e.g., "9/9 tests passed")

### Section Order (README pattern)
1. Title + tagline
2. Overview
3. Features
4. Quick Start / Installation
5. API Reference
6. Testing
7. Architecture
8. Configuration
9. Troubleshooting
10. Roadmap
11. Contributing
12. Links

---

## Evidence

- Emoji headers: `README.md:9` (`## 🎯 Overview`)
- Code blocks: `README.md:51-71` (bash install flow)
- ASCII diagram: `README.md:159-178`
- Status indicators: `README.md:150-154`
