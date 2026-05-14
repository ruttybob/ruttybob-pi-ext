# AGENTS.md — session-recap

- Generates session recap on terminal focus regain (DECSET ?1004) or idle timeout after turn_end.
- Falls back to idle timer when terminal lacks focus events.
- Also fires on `/resume` (session_start with reason="resume").
- Recap widget appears above editor; content is LLM-generated summary of recent turns.
