import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import forkTo from "./fork-to.js";
import forkBack from "./fork-back.js";

export default function (pi: ExtensionAPI) {
  forkTo(pi);
  forkBack(pi);
}
