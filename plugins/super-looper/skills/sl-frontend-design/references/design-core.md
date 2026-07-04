# Layer 2: Design Guidance Core

These principles apply across all context types. Each yields to existing design systems and user instructions per the authority hierarchy in SKILL.md.

## Typography

- Choose distinctive, characterful fonts. Avoid the usual suspects (Inter, Roboto, Arial, system defaults) unless the existing codebase uses them.
- Two typefaces maximum without a clear reason for more. Pair a display/headline font with a body font.
- *Yields to existing font choices when detected in Layer 0.*

## Color & Theme

- Commit to a cohesive palette using CSS variables. A dominant color with sharp accents outperforms timid, evenly-distributed palettes.
- No purple-on-white bias, no dark-mode bias. Vary between light and dark based on context.
- One accent color by default unless the product already has a multi-color system.
- *Yields to existing color tokens when detected.*

## Composition

- Start with composition, not components. Treat the first viewport as a poster, not a document.
- Use whitespace, alignment, scale, cropping, and contrast before adding chrome (borders, shadows, cards).
- Default to cardless layouts. Cards are allowed when they serve as the container for a user interaction (clickable item, draggable unit, selectable option). If removing the card styling would not hurt comprehension, it should not be a card.
- *All composition rules are defaults. The user can override them.*

## Motion

- Ship 2-3 intentional motions for visually-led work: one entrance sequence, one scroll-linked or depth effect, one hover/reveal transition.
- Use the project's existing animation library if one is present.
- When no existing library is found, use framework-conditional defaults:
  - **CSS animations** as the universal baseline
  - **Framer Motion** for React projects
  - **Vue Transition / Motion One** for Vue projects
  - **Svelte transitions** for Svelte projects
- Motion should be noticeable in a quick recording, smooth on mobile, and consistent across the page. Remove if purely ornamental.

## Accessibility

- Semantic HTML by default: `nav`, `main`, `section`, `article`, `button` -- not divs for everything.
- Color contrast meeting WCAG AA minimum.
- Focus states on all interactive elements.
- Accessibility and aesthetics are not in tension when done well.

## Imagery

- When images are needed, prefer real or realistic photography over abstract gradients or fake 3D objects.
- Choose or generate images with a stable tonal area for text overlay.
- If image generation tools are available in the environment, use them to create contextually appropriate visuals rather than placeholder stock.

## Creative Energy

This skill provides structure, but the goal is distinctive work that avoids AI slop -- not formulaic output.

For greenfield work, commit to a bold aesthetic direction. Consider the tone: brutally minimal, maximalist, retro-futuristic, organic/natural, luxury/refined, playful, editorial, brutalist, art deco, soft/pastel, industrial -- or invent something that fits the context. There are endless flavors. Use these for inspiration but design one that is true to the project.

Ask: what makes this unforgettable? What is the one thing someone will remember?

Match implementation complexity to the aesthetic vision. Maximalist designs need elaborate code with extensive animations and effects. Minimalist designs need restraint, precision, and careful attention to spacing, typography, and subtle details. Elegance comes from executing the vision well, not from intensity.
