# VibErrands: Next Implementation Plan

This file is an internal implementation note for the next release phase.

## Goal
Ship the first complete task lifecycle:
- User creates task
- System suggests tags via LLM
- User confirms/removes suggested tags
- Task is published
- Another user takes task (in work)
- Creator marks task done

## What to implement next

### 1. Backend domain models and DB migrations
Add SQLAlchemy models and migrations for:
- `tasks`
  - `id`
  - `creator_id` (FK -> users.id)
  - `title` (optional short name)
  - `description`
  - `price`
  - `estimated_minutes`
  - `mode` (`online` or `offline`)
  - `status` (`open`, `in_work`, `done`)
  - `assignee_id` (nullable FK -> users.id)
  - `created_at`
  - `updated_at`
- `tags`
  - `id`
  - `name` (unique)
- `task_tags` (many-to-many)
  - `task_id`
  - `tag_id`

Use Alembic for migrations instead of startup `create_all`.

### 2. Backend API for tasks
Implement protected endpoints:
- `POST /tasks/suggest-tags`
  - input: task draft (`description`, `mode`, maybe `price`)
  - output: suggested tag list from LLM
- `POST /tasks`
  - creates task with final selected tags
- `GET /tasks`
  - list open tasks + filters (mode, tag)
- `GET /tasks/{task_id}`
  - full task details
- `POST /tasks/{task_id}/take`
  - sets task to `in_work`, assigns current user
- `POST /tasks/{task_id}/complete`
  - only creator can set to `done`

Validation rules:
- Creator cannot take own task.
- Only `open` task can be taken.
- Only creator can complete task.
- Price must be positive.
- Estimated time must be positive.

### 3. LLM integration layer
Add isolated service module for tag suggestion:
- `app/services/tag_suggester.py`
- Interface:
  - `suggest_tags(description: str, mode: str) -> list[str]`
- Requirements:
  - deterministic prompt template
  - response normalization (lowercase, trim, deduplicate)
  - max tags limit (for example 8)
  - fallback tags if LLM fails
  - timeout + error handling

Do not hard-wire provider-specific logic into route handlers.

### 4. Frontend task flow
Build pages/components:
- Create Task page:
  - inputs: description, price, estimated minutes, mode
  - button: "Suggest tags"
  - show suggested tags as removable chips
  - create task with final tags
- Task Feed page:
  - cards with status and key fields
  - filter by mode/tag
  - action button: "Take task" for open tasks
- Task Details page:
  - show full info + tags + status
  - creator-only button: "Mark done"

Keep auth guard in router for all task pages.

### 5. API and client contract cleanup
- Move frontend API base URL to env variable (`VITE_API_BASE_URL`).
- Add typed request/response models on backend and shared naming consistency.
- Standardize backend errors to `{ "detail": "..." }`.

### 6. Testing and release hardening
Add tests:
- Backend unit tests for validation and permission checks.
- Backend integration tests for full task lifecycle.
- Frontend smoke tests for auth + create/take/complete actions.

Operational hardening:
- rate limiting for auth and mutation endpoints
- logging around LLM calls and task status transitions
- basic CI: lint + test

## Suggested execution order
1. Add Alembic and create migrations.
2. Implement `tasks`, `tags`, `task_tags` models.
3. Add task endpoints without LLM (static tags) and verify flow.
4. Add LLM suggestion service + endpoint.
5. Build frontend create/feed/details pages.
6. Wire frontend to new task endpoints.
7. Add tests and finalize API docs.

## Definition of done for next phase
- Authenticated user can create a task with final chosen tags.
- Another user can take the task, changing status to `in_work`.
- Creator can mark task as `done`.
- End-to-end flow works from UI and API.
- Migration-driven DB schema is in place.
- README includes exact run and env instructions for LLM key configuration.
