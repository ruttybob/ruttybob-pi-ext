---
description: Worker → reviewer → worker chain — implement, review, apply feedback
argument-hint: "<task>"
---

Invoke `subagent` in **chain** mode:

1. `worker` — implement: $@
2. `reviewer` — review the implementation ({previous})
3. `worker` — apply review feedback ({previous})
