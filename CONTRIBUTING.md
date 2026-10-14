# Contributing

Use Node.js 24. There are no runtime npm packages to install.

1. Read the current implementation boundaries and agent contract.
2. Make a focused change with a clear before/after behavior.
3. For money, identity, permissions or task state, add a regression demonstrating the invariant.
4. Run `npm test` and `npm run build:site`.
5. Update capability discovery and docs whenever API behavior changes.

Do not commit databases, credentials, real customer files or personal account records.
Use synthetic test evidence; label it as synthetic. Do not turn an operator assertion
into a claim of automatic model verification.

Open a pull request with the problem, change, validation and remaining limitations.
License contributions under this repository's MIT license.
