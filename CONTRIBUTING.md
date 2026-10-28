# Contributing

Use Node.js 24 and Python 3. Start with the [quick start](README.md#quick-start), then see [development](docs/development.md) for source files and commands.

Keep changes focused. Describe the problem, resulting behavior, and actual validation in each pull request. Preserve configuration import compatibility and recoverable raw data. Add database migrations rather than rewriting applied ones.

Do not commit `dist/`, credentials, remote deployment configuration, database backups, or personal links. Use fictional content in examples and tests.

For bug reports, include the operating system, browser version, reproduction steps, and a sanitized error message. Never attach `.dev.vars`, `.wrangler/`, a real configuration export, or a database backup. Remove credentials and personal content from any minimal reproduction.

Documentation is maintained in English.
