---
name: ui-design
description:  User interface design preferences and best practices. It should be used during any UI design actions.
---

We use [chadcn](https://ui.shadcn.com/) (if react) and https://www.shadcn-vue.com/ if the project is nuxtjs or vuejs.

### Buttons
In this project, we **always** prefer ICONS over labeled buttons.

The icons _mostly_ should NOT be inside a box they should be by themselves.

Some buttons can and should be added where appropriate either for ease of use or contrast to break up UI monotony

In this project, we prefer simplicity over complexity.

Try to make things pop using shadows and gradients. Do not over use them. Just where appropriate.

Where possible you should try to add transitions to make actions and movements smoother for the user.

### Toggles
Use the shared `icon-toggle` class for icon-based option toggles, as used by the forecast method and Chart/Table controls. This is the standard for new toggles: 30px square buttons, 16px icons, 8px corner radius, white backgrounds, zero gap and no container padding. Only the selected option has a visible border and shadow; inactive options have neither. Keep the `min-height: 0` override so responsive touch-target styles do not stretch the squares. Preserve accessible labels, tooltips or titles, and keyboard interaction.