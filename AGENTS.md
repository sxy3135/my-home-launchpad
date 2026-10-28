# Development instructions

- Read README.md and the relevant guides in docs/ before changing behavior.
- Check the working tree first and preserve existing work.
- Edit source files; generate dist/ through the build.
- Follow the naming conventions in docs/development.md and update references when moving files.
- Preserve configuration validation, recoverable raw data, authentication, and cache boundaries.
- Do not rewrite applied database migrations. Add a migration for schema changes.
- Keep secrets, credentials, database backups, and real personal configuration out of source, logs, examples, and shared artifacts.
- Run checks relevant to the change. Avoid unrelated or repeated full test runs.
- Keep documentation in plain English. Lead with purpose, requirements, and commands. Use familiar terms and direct instructions; remove filler and unnecessary comparisons.
- Update the relevant documentation when behavior, requirements, or operations change.
- Do not use computer control without explicit user authorization. Provide manual instructions for account authorization and system settings.
- Publish or modify remote data only within the user's authorized scope.
