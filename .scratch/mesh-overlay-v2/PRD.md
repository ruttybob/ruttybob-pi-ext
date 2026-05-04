Status: wontfix (superseded by mesh-overlay-v3)
Category: enhancement

## Problem Statement

The `/mesh` overlay renders as a transparent floating panel that visually mixes with the underlying session messages, making it hard to distinguish overlay content from conversation output. Additionally, the scrolling behaviour is frustrating: the Agents tab scrolls one rendered line at a time instead of jumping between agent blocks, and the Feed tab lacks PageUp/PageDown for navigating long activity histories.

## Solution

Redesign the `/mesh` overlay with three targeted improvements: (1) add a visible yellow border that separates overlay content from session messages, (2) implement block-based scrolling for the Agents tab so each Up/Down press jumps to the next agent entry, and (3) add PageUp/PageDown keyboard support for all tabs with line-based paging in Feed/Chat and block-based paging in Agents.

## User Stories

1. As a mesh user, I want the overlay to have a visible yellow border around it, so that I can clearly distinguish mesh content from the session conversation underneath.
2. As a mesh user, I want the top border to show the current tab labels (Agents, Feed, Chat), so that I can see which tab is active without looking inside the content area.
3. As a mesh user, I want the bottom border to show relevant keybinding hints, so that I know which keys are available without memorising them.
4. As a mesh user, I want the border colour to use the theme's warning/yellow colour, so that it stands out visually from other UI elements.
5. As a mesh user, I want pressing Down in the Agents tab to jump to the next agent block, so that I can quickly navigate between agents instead of scrolling one detail line at a time.
6. As a mesh user, I want pressing Up in the Agents tab to jump to the previous agent block, so that I can navigate backwards efficiently.
7. As a mesh user, I want each agent block to include all associated lines (name, details, reservations, status, spacing), so that scrolling never splits an agent's information across the viewport boundary.
8. As a mesh user, I want to press PageDown in the Feed tab to jump forward by a full page of events, so that I can quickly scan long activity histories.
9. As a mesh user, I want to press PageUp in the Feed tab to jump backward by a full page, so that I can navigate back to older events without tapping Up repeatedly.
10. As a mesh user, I want PageUp/PageDown to work in all tabs, so that the navigation experience is consistent across Agents, Feed, and Chat.
11. As a mesh user, I want PageDown in the Agents tab to scroll by multiple agent blocks, so that I can skip through large agent lists efficiently.
12. As a mesh user, I want the border width to adapt to the terminal width, so that the border always spans the full overlay width.
13. As a mesh user, I want the overlay content to be indented by one space inside the border, so that text doesn't touch the border characters directly.
14. As a mesh user, I want the existing overlay functionality (tab switching, chat input, mention completion, unregistered hint) to continue working unchanged, so that the redesign doesn't regress current behaviour.
15. As a mesh user, I want the border to be rendered using the DynamicBorder component from the pi framework, so that it follows the established UI patterns of other extensions.

## Implementation Decisions

- **Border implementation**: Use `DynamicBorder` from `@mariozechner/pi-coding-agent`, styled with `theme.fg("warning", s)` for a yellow border. Top and bottom borders will be added as the first and last rendered lines of the overlay, replacing the current plain `─` separators.
- **Content indentation**: All content lines inside the border will be prefixed with one space to create visual padding between the border edge and text.
- **Content width adjustment**: The content width passed to tab renderers will be reduced by 2 (left and right border character) to prevent overflow beyond the border.
- **Agent block tracking**: During `renderAgents()`, the renderer will record an `agentBlocks` array mapping each agent to its starting line index and line count in the rendered output. This array is used by `handleInput()` to compute block-aware scroll targets.
- **Block-based scroll for Agents tab**: When the current tab is "agents", Up/Down handlers will find the agent block containing the current `scrollOffset` and move to the previous/next block boundary. If no block contains the current offset, fall back to the nearest block edge.
- **PageUp/PageDown support**: New `Key.pageUp` and `Key.pageDown` handlers will be added to `handleInput()`. The page size will be computed from the visible content height (overlay height minus header, tab bar, and footer lines). PageDown adds `pageSize` lines; PageUp subtracts `pageSize` lines, clamped to 0.
- **Agents tab PageUp/PageDown**: Will move by `pageSize` lines but snap to the nearest agent block boundary after the jump, ensuring agents are never split.
- **Footer hints update**: The footer line will include `PgUp/PgDn: page` in the keybinding hints for all tabs.
- **Scroll reset on tab switch**: Already implemented (`this.scrollOffset = 0`), will remain unchanged.

## Testing Decisions

- **Good test**: Exercises overlay through its public interface (`render(width)` and `handleInput(data)`), checking observable output (line content, scroll position) without asserting on internal data structures.
- **Border tests**: Verify that `render(80)` output contains border characters at expected positions, and that content lines are indented by one space inside the border.
- **Agent block scroll tests**: Render an overlay with multiple agents (via a temp registry directory), press Down, verify `scrollOffset` jumped to the next agent's first line rather than by +1.
- **PageUp/PageDown tests**: Render an overlay with many feed events, press PageDown, verify offset increased by approximately the page size; press PageUp, verify offset returned to the previous position.
- **Regression tests**: Existing 3 overlay tests (unregistered guard, hint, normal input) must continue passing after border changes. The `lines.some()` assertions are flexible enough to survive border line additions.
- **Modules tested**: `overlay.ts` — the only module being modified. Tests in `extensions/pi-mesh/tests/overlay-no-register.test.ts` and a new test file for scroll/border behaviour.
- **Prior art**: The existing `overlay-no-register.test.ts` establishes the pattern: `makeState()`, `makeTui()`, `makeTheme()`, `makeOverlay()`, then call `render()` and `handleInput()` directly.

## Out of Scope

- Converting the overlay to a persistent widget (`ctx.ui.setWidget()`) — this would lose keyboard interactivity needed for the Chat tab.
- Auto-refreshing the overlay content while the overlay is open (e.g., live agent status updates).
- Changing the overlay anchor position or size from current `bottom-center`, `100%`, `60%`.
- Adding search/filter functionality to any tab.
- Changing the Chat tab scrolling behaviour (currently shows last 20 messages).

## Further Notes

- The `DynamicBorder` component is used by other extensions in this repo (e.g., `pi-auto-rename`), establishing a consistent visual pattern.
- The theme's "warning" colour maps to yellow in the default dark theme, providing strong visual contrast against the accent (blue/cyan) and dim (gray) colours already used in the overlay.
- Agent block heights are variable (1 line minimum, 5+ lines with reservations and status messages), making block-aware scrolling a significant UX improvement over line-by-line scrolling.

## Comments

> *This was generated by AI during triage.*

## Agent Brief

**Category:** enhancement
**Summary:** Add yellow border, block-based agent scrolling, and PageUp/PageDown to the mesh overlay

**Current behavior:**
The `/mesh` overlay renders as a transparent floating panel with plain `─` separator lines for header and footer. Content visually mixes with the underlying session messages. The Agents tab scrolls one rendered line at a time — since each agent occupies 2–5 lines (name, details, reservations, status, spacing), navigating between agents requires multiple Down presses. There is no PageUp/PageDown support in any tab.

**Desired behavior:**

1. **Yellow border.** The entire overlay is wrapped in a visible border using `DynamicBorder` from `@mariozechner/pi-coding-agent`, styled with `theme.fg("warning", s)`. The top border incorporates the tab bar labels (Agents, Feed, Chat) with the active tab highlighted. The bottom border shows keybinding hints including PgUp/PgDn. Content lines are indented by one space inside the border. Content width is reduced by 2 to prevent overflow beyond border characters.

2. **Block-based scrolling on Agents tab.** When the active tab is "agents", pressing Up/Down jumps to the previous/next agent block boundary instead of moving by one rendered line. An agent block is all lines belonging to one agent: name line, details line, reservation lines, status message line, and the trailing blank spacing line. The renderer tracks block boundaries during `renderAgents()` so `handleInput()` can compute the correct scroll target. PageUp/PageDown on the agents tab moves by approximately one page of lines, then snaps to the nearest agent block boundary.

3. **PageUp/PageDown on all tabs.** `Key.pageUp` and `Key.pageDown` from `@mariozechner/pi-tui` are handled in `handleInput()`. Page size is computed from the visible content height. On Feed and Chat tabs, paging moves by `pageSize` lines. On Agents tab, paging snaps to block boundaries. Footer hints are updated to include `PgUp/PgDn: page`.

**Key interfaces:**
- `MeshOverlay` class — `render(width)` and `handleInput(data)` are the public API. All three changes live here.
- `DynamicBorder` component from `@mariozechner/pi-coding-agent` — used for the border. See `pi-auto-rename` extension in this repo for prior usage pattern.
- `Key.pageUp` / `Key.pageDown` from `@mariozechner/pi-tui` — already exported, not yet used in overlay.
- `theme.fg("warning", s)` — yellow/warning colour from the theme palette, used for border styling.
- `truncateToWidth` from `@mariozechner/pi-tui` — already imported, content width must be reduced by 2 for border characters.

**Acceptance criteria:**
- [ ] `render(80)` output includes a visible border (top and bottom) styled with `theme.fg("warning")` that wraps the entire content area
- [ ] Top border incorporates tab labels with the active tab visually distinguished
- [ ] Bottom border includes keybinding hints with PgUp/PgDn mentioned
- [ ] Content lines inside the border are indented by one space
- [ ] On Agents tab, pressing Down moves `scrollOffset` to the first line of the next agent block (not +1 line)
- [ ] On Agents tab, pressing Up moves `scrollOffset` to the first line of the previous agent block
- [ ] On Agents tab, PageDown/PageUp move by approximately one page and snap to agent block boundaries
- [ ] On Feed tab, PageDown increases scrollOffset by approximately pageSize; PageUp decreases it, clamped to 0
- [ ] On Chat tab, PageUp/PageDown scroll the message history; typing, Enter, Backspace, mention completion still work
- [ ] All existing overlay tests pass unchanged (3 tests in overlay-no-register.test.ts)
- [ ] New tests cover border presence, agent block scroll, and page navigation

**Out of scope:**
- Converting the overlay to a widget (would lose chat interactivity)
- Changing overlay position, anchor, or size
- Auto-refreshing overlay content
- Search/filter on any tab
- Changing Chat tab message window (currently last 20)
