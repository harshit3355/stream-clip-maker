# AGENT.md — Stream Clip Maker

This file gives AI coding agents and automated contributors the project-wide rules for working in this repository. Follow it together with CONTRIBUTING.md and the relevant issue or pull-request description.

## Project overview

Stream Clip Maker turns Twitch and YouTube chat activity into candidate highlights and vertical clips. It includes a Node.js CLI, a Tauri desktop interface, media-processing scripts, and optional Twitch/YouTube integrations.

## Before changing code

1. Read README.md and CONTRIBUTING.md.
2. Inspect the relevant implementation and existing tests before proposing a change.
3. Check the related issue and pull-request discussion for requirements and acceptance criteria.
4. Keep changes focused; do not reformat or rewrite unrelated files.

## Development and verification

- Requires Node.js 18 or newer and npm.
- Install dependencies with npm ci when a lockfile is present.
- Run npm test for syntax checks and CLI smoke tests.
- Run npm run build for the desktop frontend when changing UI/build code.
- Validate changed shell scripts with bash -n.
- Add deterministic Node.js tests for behavior changes. CI discovers project-owned test and spec files and runs them with node --test.
- Keep tests offline and independent of personal accounts, real streams, OAuth, and external publishing services.

## Safety, privacy, and rights

- Never read, print, copy, commit, or upload credentials, access tokens, OAuth files, populated environment files, private chat logs, or personal media.
- Use .env.example only as a template. Keep real credentials in local ignored configuration.
- Do not add secrets to CI. Tests must not require Twitch or YouTube credentials.
- Never make tests download real VODs, render full clips, upload videos, or publish content as a side effect.
- Finding a public stream or VOD does not grant permission to download, edit, reuse, or publish it. Preserve explicit rights confirmation and private-by-default upload behavior.
- Do not delete user data or generated files as part of routine development or tests.

## Contribution expectations

- Follow CONTRIBUTING.md and the acceptance criteria for the issue.
- Update user documentation when commands, flags, configuration, or behavior change.
- Keep dependencies minimal and explain new dependencies in the PR.
- Report exactly which checks were run and disclose failures or platform limitations.
- Do not claim a test or build passed unless it actually completed successfully.
- Do not create releases, publish npm packages, change repository settings, or deploy the website unless explicitly requested.

## Platform notes

The project supports its documented Linux and Windows workflows. Do not introduce macOS build targets without an explicit project decision; macOS users can use the terminal interface (TUI).
