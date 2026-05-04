import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { unlinkSync } from "node:fs";

export default function (pi: ExtensionAPI) {
  pi.registerCommand("fork-back", {
    description: "Return to parent session and delete this fork",
    handler: async (_args: string, ctx: ExtensionCommandContext) => {
      const header = ctx.sessionManager.getHeader();
      if (!header?.parentSession) {
        ctx.ui.notify("No parent session found", "error");
        return;
      }

      const currentPath = ctx.sessionManager.getSessionFile();
      if (!currentPath) {
        ctx.ui.notify("Current session is ephemeral (no file)", "error");
        return;
      }

      const ok = await ctx.ui.confirm(
        "Return to parent?",
        `Switch back to parent session and delete this fork?\n\nParent: ${header.parentSession}`
      );
      if (!ok) return;

      const parentPath = header.parentSession;
      await ctx.switchSession?.(parentPath, {
        withSession: async (ctx) => {
          ctx.ui.notify(`Returned to parent session`, "info");
        },
      });

      unlinkSync(currentPath);
    },
  });
}
