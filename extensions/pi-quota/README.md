# pi-quota

Pi extension that displays your API quota usage as a centered TUI overlay with two switchable tabs: **ZAI** and **OpenRouter**.

## Usage

```
/quota
```

Shows an overlay with two tabs — switch with **Tab** or **←/→** keys:

### ZAI tab
- Current plan level
- Time / token limits with progress bars
- Per-model usage breakdown
- Reset countdown

### OpenRouter tab
- Credits remaining / Monthly budget (if limit is set)
- Daily / Weekly spending with progress bars
- Reset countdowns (UTC-based)
- Usage percentage warnings (green → amber → red)

### Controls

| Key | Action |
|-----|--------|
| `Tab` / `→` | Next tab |
| `←` | Previous tab |
| `r` | Refresh active tab |
| `q` / `Esc` | Close |

## Setup

```bash
export OPENROUTER_API_KEY=your-openrouter-key
export ZAI_API_KEY=your-zai-key
```
