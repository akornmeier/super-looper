# Privacy & Data Handling

This repository contains the `super-looper` Claude Code plugin
(`plugins/super-looper`), made of markdown/config content, plus the
release tooling that versions and publishes it.

## Summary

- The plugin package does not include telemetry or analytics code.
- The plugin package does not run a background service that uploads repository/workspace contents automatically.
- Data leaves your machine only when your host/tooling or an explicitly invoked integration performs a network request.

## What May Send Data

1. AI host/model provider

When you run the plugin in Claude Code, Claude Code may send prompts/context/code to its configured model provider. This behavior is controlled by Claude Code and the provider, not by this plugin repository.

2. Optional integrations and tools

The plugin includes optional capabilities that can call external services when explicitly used, for example:
- Context7 MCP (`https://mcp.context7.com/mcp`) for documentation lookup
- Proof (`https://www.proofeditor.ai`) when using share/edit flows
- Other opt-in skills (for example cloud upload workflows) that call their own external APIs/services

If you do not invoke these integrations, they do not transmit your project data.

3. Package/installer infrastructure

Installing dependencies or packages communicates with package registries/CDNs according to your package manager configuration.

## Data Ownership and Retention

This repository does not operate a backend service for collecting or storing your project/workspace data. Data retention and processing for model prompts or optional integrations are governed by the external services you use.

## Security Reporting

If you identify a security issue in this repository, follow the disclosure process in [SECURITY.md](SECURITY.md).
