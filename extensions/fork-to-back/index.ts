import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import forkTo from "./fork-to";
import forkBack from "./fork-back";

export default function (pi: ExtensionAPI) {
  forkTo(pi);
  forkBack(pi);
}
