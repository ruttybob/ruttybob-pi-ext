---
description: Write documentation — api, arch, module, or quickstart
argument-hint: "<type: api|arch|module|quickstart> <path-or-module>"
---

Write documentation based on the code exploration. Type and target come from `$@`.

<goal>
$@
</goal>

## Types

**api** — Document public interfaces. For each export: signature, parameters, return type, usage example, edge cases. Place JSDoc/TSDoc in source files, generate `README.md` in the module folder if it's a package.

**arch** — Architecture Decision Record. File as `docs/adr/NNNN-kebab-title.md` with: context, decision, consequences, alternatives considered. Use ADR template from `docs/adr/0000-template.md` if it exists.

**module** — Module/package README. Sections: what it does, quick example, installation, API reference (link or inline), configuration, related modules. Place as `README.md` in the module folder.

**quickstart** — Getting started guide. Sections: prerequisites, install, minimal working example, next steps. Place in `docs/quickstart-<topic>.md`.

## Rules

- Write for someone who has never seen this code
- Code examples must be runnable — no pseudocode
- Keep it short — every line earns its place
- Use the project's existing doc conventions if discoverable
- If unsure about a detail, flag it with `<!-- TODO: verify -->` rather than guessing
- Save to the suggested location, tell the user the path
