# Cinetrak Profile PRDs

This directory contains Product Requirements Documents (PRDs) for the Profile page enhancement project. Each PRD is designed for execution using the **Ralph Loop** methodology.

## Implementation Order

Execute these PRDs in order (dependencies flow downward):

| # | PRD | Complexity | Status |
|---|-----|------------|--------|
| 1 | [Collection Grid](./001-collection-grid.md) | Easy | ✅ Complete |
| 2 | [Lists View](./002-lists-view.md) | Medium | Pending |
| 3 | [First Takes](./003-first-takes.md) | Complex | Pending |

## How to Execute with Ralph Loop

For each PRD, follow the Ralph Loop methodology:

### 1. Start the Loop
```
/ralph-loop
```

### 2. Provide the PRD
Point the agent to the PRD file:
```
Execute PRD at .claude/prds/001-collection-grid.md
```

### 3. Follow Checkpoints
Each PRD has clearly defined checkpoints. The agent should:
- Complete one checkpoint at a time
- Verify before moving to the next
- Run `npm run lint` after each checkpoint
- Test in iOS simulator after integration

### 4. Commit Strategy
Each PRD includes a commit strategy. Follow it for clean git history.

## PRD Structure

Each PRD follows this structure:

1. **Context & Scope** - What, Why, Where, Dependencies
2. **Current State** - What exists, what's working, what's missing
3. **Success Criteria** - Checkboxes that define "done"
4. **Technical Requirements** - Must Have / Nice to Have / Out of Scope
5. **Implementation Guidance** - Step-by-step with code examples
6. **Key Files** - Reference table of relevant files
7. **Design Specifications** - Detailed visual specs
8. **Verification Steps** - How to test each feature
9. **Edge Cases** - Error handling table
10. **Ralph Loop Checkpoints** - Phased completion criteria
11. **Commit Strategy** - Git commit messages for each phase

## Feature Overview

### PRD 001: Collection Grid
Enhance the existing Collection tab to display real watched movies from Supabase in an Instagram-style 3-column grid.

**Key deliverables:**
- Status filter for `useUserMovies` hook
- Empty/loading/error states
- Navigation to movie detail

### PRD 002: Lists View
Display user's custom movie lists with Letterboxd-style cards.

**Key deliverables:**
- `user_lists` and `list_movies` database tables
- `useUserLists` hook
- List card integration
- List detail route stub

### PRD 003: First Takes
iMessage-style feed of quick movie reactions/reviews.

**Key deliverables:**
- `first_takes` database table
- `useFirstTakes` hook
- `FirstTakeCard` component
- Relative timestamp utility
- "Latest Snapshot" highlight

## Future PRDs (Not Yet Written)

- Create List Flow
- Add Movie to List
- List Detail Screen
- Create First Take Flow
- Edit/Delete Features
- Public Sharing Features
