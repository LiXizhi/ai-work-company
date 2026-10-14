# Working on AI Work Company

Read README.md and docs/implementation.md before editing. Full product proposals
live in docs/design; do not describe them as shipped features.

- Website, machine-readable contracts and backend stay in this repository.
- Prefer small, dependency-light modules. Runtime is Node.js 24, SQLite and HTTP.
- Money is integer minor units (100 = 1 work credit); never floating point.
- Account creation and unpaid trial never mint consumer spending credit.
- All mutations of task state and money must be transactional and idempotent.
- Worker claims and model names are untrusted. No automatic model-certification claim.
- Do not add host shell, filesystem, MCP forwarding or payment endpoints without
  implementing and testing the corresponding boundaries in docs/design/security.md.
- No secrets, personal notes, live databases, real customer data or test credentials
  in commits. Keep synthetic fixtures in memory or an ignored temporary directory.
- Run npm test and npm run build:site after protocol or backend changes.
- Update the OpenAPI contract and agent.md with behavior changes. Pages is a static
  documentation site, never a live marketplace backend.
