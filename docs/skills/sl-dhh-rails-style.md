# `sl-dhh-rails-style`

> Write Ruby and Rails code in DHH's 37signals style — REST purity, fat models, thin controllers, records-as-state, Hotwire, and "clarity over cleverness."

`sl-dhh-rails-style` is the **house-style** skill for Ruby and Rails. It applies domain expertise extracted from analyzing production 37signals codebases (Fizzy/Campfire) and DHH's code-review patterns, then routes your task to the reference that covers it — controllers, models, frontend, architecture, testing, or gems. The point isn't syntax; it's the set of taste calls that make code read like 37signals wrote it.

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Applies 37signals/DHH Rails conventions when writing, refactoring, or reviewing Ruby and Rails code |
| When to use it | Writing Ruby/Rails, creating models or controllers, or reviewing code against DHH style; mentions of DHH, 37signals, Basecamp, HEY, or Campfire |
| What it produces | Code (or a review) that follows the conventions, drawn from the matching reference |
| Skip when | You're not writing Ruby/Rails, or your project has a different, established house style |

---

## The Philosophy

"The best code is the code you don't write. The second best is the code that's obviously correct." Vanilla Rails is plenty: rich domain models over service objects, CRUD controllers over custom actions, concerns for horizontal sharing, records-as-state instead of boolean columns, database-backed everything. Just as important is what the style **deliberately avoids** — devise (custom ~150-line auth), pundit/cancancan (simple role checks in models), sidekiq (Solid Queue on the database), redis, view_component, GraphQL, factory_bot, rspec, and Tailwind.

---

## What Makes It Novel

### 1. Extracted from real 37signals code

The conventions aren't a blog-post summary — they're distilled from production Fizzy/Campfire codebases and DHH's own review comments, so the guidance reflects how these patterns actually play out at scale.

### 2. Encodes what to *avoid*, not just what to do

Half the value is the deliberate omissions. The skill names the gems and patterns 37signals refuses and what they use instead, so you don't reach for devise or sidekiq by reflex.

### 3. Intake-and-route by task area

An eight-option intake — controllers, models, views/frontend, architecture, testing, gems, code review, general — reads only the matching reference. Code review reads all references, then evaluates.

### 4. Naming as a first-class concern

Verbs for state changes (`card.close`, `board.publish`), predicates derived from related records (`card.closed?`), adjective concerns for capabilities (`Closeable`, `Watchable`), noun controllers matching resources (`Cards::ClosuresController`), and business-term scopes (`active`, `unassigned`, `chronologically`) over SQL-ish names.

---

## Quick Example

You ask for a way to mark a card as closed. Instead of a `closed:boolean` column and a `set_closed` method, the skill guides you to a `Closeable` concern, a `card.close` verb that creates a `Closure` record, a `card.closed?` predicate derived from that record's presence, and a RESTful `Cards::ClosuresController#create` — records as state, thin controller, expressive names.

---

## When to Reach For It

Reach for it when:

- You're writing or refactoring Ruby/Rails and want it to match 37signals conventions
- You're reviewing Rails code against the DHH style bar

Skip it when:

- The project already commits to a different house style — imposing this one would fight the codebase
- You're not writing Ruby or Rails

---

## See Also

- [`/sl-code-review`](./sl-code-review.md) — general structured code review, when you want persona-based feedback rather than a single-style lens
- [`/sl-simplify-code`](./sl-simplify-code.md) — clarity-and-reuse refinement that complements the "clarity over cleverness" philosophy
