import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { SessionManager } from "@mariozechner/pi-coding-agent";
import { resolve } from "node:path";
import { mkdirSync } from "node:fs";

export default function (pi: ExtensionAPI) {
  pi.registerCommand("fork-to", {
    description: "Copy current session to another directory (usage: /fork-to ~/path)",
    handler: async (args, ctx) => {
      const targetDir = args.trim();
      if (!targetDir) {
        ctx.ui.notify("Usage: /fork-to <target-directory>", "error");
        return;
      }
      const sourcePath = ctx.sessionManager.getSessionFile();
      if (!sourcePath) {
        ctx.ui.notify("Current session is ephemeral (no file)", "error");
        return;
      }
      const resolved = resolve(targetDir);
      const ok = await ctx.ui.confirm(
        "Copy session?",
        `Copy current session to ${resolved}?`
      );
      if (!ok) return;

      mkdirSync(resolved, { recursive: true });
      const sm = SessionManager.forkFrom(sourcePath, resolved);
      await ctx.switchSession(sm.getSessionFile()!, {
        withSession: async (ctx) => {
          ctx.ui.notify(`Session copied to ${resolved}`, "info");
        },
      });
    },
  });
}
