# Hard Rules, Litmus Checks, and Visual Verification

## Hard Rules & Anti-Patterns

### Default Against (Overridable)

These are the skill being opinionated. The user can override any of them.

- Generic SaaS card grid as the first impression
- Purple-on-white color schemes, dark-mode bias
- Overused fonts (Inter, Roboto, Arial, Space Grotesk, system defaults) in greenfield work
- Hero sections cluttered with stats, schedules, pill clusters, logo clouds
- Sections that repeat the same mood statement in different words
- Carousel with no narrative purpose
- Multiple competing accent colors
- Decorative gradients or abstract backgrounds standing in for real visual content
- Copy that sounds like design commentary ("Experience the seamless integration")
- Split-screen heroes where text sits on the busy side of an image

### Always Avoid (Quality Floor)

These are genuine quality failures no user would want.

- Prompt language or AI commentary leaking into the UI
- Broken contrast -- text unreadable over images or backgrounds
- Interactive elements without visible focus states
- Semantic div soup when proper HTML elements exist

## Litmus Checks

Quick self-review before moving to visual verification. Not all checks apply in every context -- apply judgment about which are relevant.

- Is the brand or product unmistakable in the first screen?
- Is there one strong visual anchor?
- Can the page be understood by scanning headlines only?
- Does each section have one job?
- Are cards actually necessary where they are used?
- Does motion improve hierarchy or atmosphere, or is it just there?
- Would the design feel premium if all decorative shadows were removed?
- Does the copy sound like the product, not like a prompt?
- Does the new work match the existing design system? (Module C)

## Visual Verification

After implementing, verify visually. This is a sanity check, not a pixel-perfect review. One pass. If there is a glaring issue, fix it. If it looks solid, move on.

### Tool Preference Cascade

Use the first available option:

1. **Existing project browser tooling** -- if Playwright, Puppeteer, Cypress, or similar is already in the project's dependencies, use it. Do not introduce new dependencies just for verification.
2. **Browser MCP tools** -- if browser automation tools (e.g., claude-in-chrome) are available in the agent's environment, use them.
3. **agent-browser CLI** -- if nothing else is available and `agent-browser` is installed, use it. If not installed, inform the user: "`agent-browser` is not installed. Run `/sl-setup` to install required dependencies." Then skip to the next option.
4. **Mental review** -- if no browser access is possible (headless CI, no permissions to install), apply the litmus checks as a self-review and note that visual verification was skipped.

### What to Assess

- Does the output match the visual thesis from the pre-build plan?
- Are there obvious visual problems (broken layout, unreadable text, missing images)?
- Does it look like the context module intended (landing page feels like a landing page, dashboard feels like a dashboard, component fits its surroundings)?

### Scope Control

One iteration. Take a screenshot, assess against the litmus checks, fix any glaring issues, and move on. Include the screenshot in the deliverable (PR description, conversation output, etc.).

For iterative refinement beyond a single pass (multiple rounds of screenshot-assess-fix), see the `sl-design-iterator` agent.
