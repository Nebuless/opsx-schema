# opentui-documentation-coverage Specification

## Purpose
Tracks canonical OpenTUI documentation coverage against a versioned upstream source so missing or stale reference mappings remain visible.

## Requirements

### Requirement: Versioned source inventory
The collection SHALL record canonical OpenTUI documentation paths with upstream revision, local route, and review status, and provide a check for missing or stale mappings.

#### Scenario: Upstream adds a page
- **GIVEN** a new canonical documentation page
- **WHEN** the inventory check runs against a refreshed upstream tree
- **THEN** it reports the unmapped page without claiming that existing references are complete
