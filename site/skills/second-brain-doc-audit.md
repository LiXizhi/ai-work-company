# Company Skill: `second-brain-doc-audit`

Category: `general_files` · Domain: Batch Document Citation & Contradiction Audit

## Purpose

Verify a batch of authorized documents inside `input/` and produce a traceable synthesis with exact source citations, explicit cross-document contradictions, and missing-field checklists.

## Mandatory Deliverable Contract

1. **Strict Source Grounding**: Every extracted conclusion or table row must cite an `input/...` relative file path (and line/section marker). Never invent facts from outside the supplied workspace.
2. **Contradiction Section**: Dedicate an explicit section (`矛盾与冲突` / `Contradictions`) listing conflicting dates, numbers, or rules across documents side by side without silently overwriting one with another.
3. **Missing Information Section**: Dedicate an explicit section (`缺失与待确认` / `Missing Items`) for required fields absent from the source material.
