## ADDED Requirements

### Requirement: README states what, who, and why
The README SHALL begin with a concise explanation of what `opsx-schema` provides, who benefits from it, and why its author adapted OpenSpec, using the phrase “durable change records.”

#### Scenario: Reader arrives at the repository
- **GIVEN** a reader opens the top of `README.md`
- **WHEN** they scan the introduction before installation details
- **THEN** they can identify an OpenSpec adaptation for people who use other skills and want repeatable workflows and one CLI/dashboard overview

### Requirement: Product claims stay grounded
The introduction SHALL explain how intentional workflow configuration and OpenSpec's durable change records fit together without claiming that schemas force an agent to obey instructions or that this package replaces OpenSpec.

#### Scenario: Reader evaluates the adaptation
- **GIVEN** a reader wants to know the relationship between OpenSpec and this tool
- **WHEN** they read the opening
- **THEN** they see a complementary workflow setup and overview, not a replacement lifecycle or a guarantee of agent behavior

### Requirement: Existing use remains discoverable
The README SHALL preserve an accurate path to current installation, CLI usage, and the terminal dashboard, and SHALL avoid describing an unpublished package version as already available on npm.

#### Scenario: Reader wants to try the tool
- **GIVEN** a reader has read the new introduction
- **WHEN** they continue to setup
- **THEN** they can find the checkout commands, supported prerequisites, and current usage guidance without a broken link
