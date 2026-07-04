# Context Modules

Select the module that fits what is being built. When working inside an existing application, default to Module C regardless of what the feature is.

## Module A: Landing Pages & Marketing (Greenfield)

**Default section sequence:**
1. Hero -- brand/product, promise, CTA, one dominant visual
2. Support -- one concrete feature, offer, or proof point
3. Detail -- atmosphere, workflow, product depth, or story
4. Final CTA -- convert, start, visit, or contact

**Hero rules (defaults):**
- One composition, not a dashboard. Full-bleed image or dominant visual plane.
- Brand first, headline second, body third, CTA fourth.
- Keep the text column narrow and anchored to a calm area of the image.
- No more than 6 sections total without a clear reason.
- One H1 headline. One primary CTA above the fold.

**Copy:**
- Let the headline carry the meaning. Supporting copy is usually one short sentence.
- Write in product language, not design commentary. No prompt language or AI commentary in the UI.
- Each section gets one job: explain, prove, deepen, or convert.
- Every sentence should earn its place. Default to less copy, not more.

## Module B: Apps & Dashboards (Greenfield)

**Default patterns:**
- Calm surface hierarchy, strong typography and spacing, few colors, dense but readable information, minimal chrome.
- Organize around: primary workspace, navigation, secondary context/inspector, one clear accent for action or state.
- Cards only when the card is the interaction (clickable item, draggable unit, selectable option). If a panel can become plain layout without losing meaning, remove the card treatment.

**Copy (utility, not marketing):**
- Prioritize orientation, status, and action over promise, mood, or brand voice.
- Section headings should say what the area is or what the user can do there. Good: "Plan status", "Search metrics". Bad: "Unlock Your Potential".
- If a sentence could appear in a homepage hero, rewrite it until it sounds like product UI.
- Litmus: if an operator scans only headings, labels, and numbers, can they understand the page immediately?

## Module C: Components & Features (Default in Existing Apps)

For adding to an existing application:

- Match the existing visual language. This module is about making something that belongs, not something that stands out.
- Inherit spacing scale, border radius, color tokens, and typography from surrounding code.
- Focus on interaction quality: clear states (default, hover, active, disabled, loading, error), smooth transitions between states, obvious affordances.
- One new component should not introduce a new design system. If the existing app uses 4px border radius, do not add a component with 8px.
