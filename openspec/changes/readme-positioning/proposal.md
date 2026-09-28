## Why

The README currently starts with runtime and packaging details. A new reader cannot quickly tell who this OpenSpec adaptation is for or why it exists.

## Scope

Open the README with a short what/who/why explanation: this is for people using OpenSpec alongside other skills who want repeatable, intentionally configured workflows, durable change records, and a CLI and terminal dashboard to see their work. Keep a clear path into current installation and usage instructions.

## Exclusions

- New commands, workflow guarantees, npm publication claims, marketing promises, or a rewrite of the bundled resource collection.
- Changes to CI or the agent-delivery and publishing policies owned by sibling changes.

## What Changes

- The first screen of the README explains the purpose, audience, and creator's reason for this adaptation before package history and setup detail.
- The overview distinguishes this tool from OpenSpec itself and describes the CLI and dashboard as ways to see and manage the workflow, not as guarantees that an agent always behaves correctly.
- Existing verified installation, safety, and resource instructions remain accessible.

## Capabilities

### New Capabilities

- `project-positioning`: Defines the public README introduction and the claims it may make.

### Modified Capabilities

- None. Documentation changes do not change product behavior.

## Selected Direction

Use the user's phrase “durable change records” and a concise first-person origin story, followed by concrete what and who statements and existing quick-start guidance.

## Impact

Only repository-facing documentation is changed. Prospective users can decide earlier whether the project fits their workflow; current technical references remain available below the new opening.
