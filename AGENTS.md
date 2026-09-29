# Project instructions



## DESIGN INSTRUCTIONS

### Profile forms and dialogs
- Keep profile details read-only by default. Show plain, formatted values—not input boxes—until the user explicitly enters edit mode.
- Use a single icon-only pen button with an accessible label to enter edit mode. Show the check/save icon only while editing.
- Avoid duplicate labels or headings in read-only views. A section heading establishes the context; render its values as concise formatted text beneath it.
- Use the shared financial-entry dialog language for every profile/scenario creation dialog:
  - `entry-dialog` and `entry-dialog-header` for the dialog shell and header.
  - `entry-form` for the form body.
  - `entry-name-field` for the primary name field and its divider.
  - Outlined Cancel and dark primary submit actions.
- Profile descriptions are fixed, single-line `Input` fields—not multiline textareas.
- Preserve accessible labels, keyboard support, form validation, loading states, and explicit error messages.
- Match the project’s compact financial-statement visual system: square corners, restrained borders, dark ink, muted labels, and minimal decoration.

### Buttons
- This standard applies only to visible, text-bearing buttons—not icon-only controls.
- Use the primary action button from the “Edit income” dialog (`FinancialEntryDialog.vue`) as the application-wide standard for positive, committing actions: the default `Button` variant with the shared entry-form footer styling (dark navy `#102831`, white text, 3px corners, and darker hover state).
- Pair it with the outlined Cancel button style for dialog secondary actions; do not introduce alternate primary action colors or shapes without an explicit design decision.
- Preserve icon-only controls as distinct, minimal icon controls. Do not change their variant, geometry, shadow, or color to match text buttons unless explicitly asked.
