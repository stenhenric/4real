# Toast Notification Guidelines

This document outlines the best practices for using the Toast Notification system in the 4real application. The goal is to provide consistent, unobtrusive, and clear feedback to users while maintaining the "sketchy/notebook" aesthetic.

## When to Use Toasts vs. Modals vs. Inline Messages

### Toasts
Use toasts for **transient feedback** about the result of an action. Toasts appear temporarily and do not block the user interface.
- **Examples**:
  - "Match drafted successfully."
  - "Link copied to clipboard."
  - "Order submitted."
  - "Opponent disconnected."

### Modals
Use modals for **blocking interactions** that require explicit user input or confirmation before proceeding.
- **Examples**:
  - "Are you sure you want to resign from the match?"
  - "Confirm withdrawal of 50 USDT."
  - Detailed error states that require the user to read and acknowledge (e.g., account banned).

### Inline Messages
Use inline messages for **contextual feedback** directly related to a specific UI element, especially during forms or persistent errors.
- **Examples**:
  - Validation errors under form fields ("Username is too short").
  - "No active drafts" in a list view.
  - Persistent state warnings (e.g., "Admin mode active").

## Message Writing Guidelines

1. **Be Concise**: Keep it under 50 characters if possible. Users shouldn't have to read a paragraph.
   - *Good*: "Match drafted."
   - *Bad*: "Your match has been successfully drafted and is now waiting for an opponent."
2. **Be Clear and Actionable**: Explain what happened. If it's an error, briefly hint at why or what to do if appropriate.
   - *Good*: "Insufficient balance."
   - *Bad*: "Error 400."
3. **Maintain Tone**: Keep the casual, competitive tone where appropriate, but prioritize clarity.
   - *Good*: "Invite link scratched to clipboard!"
   - *Bad*: "URL successfully copied to system clipboard."
4. **Don't Blame the User**: For errors, use neutral language.

## Anti-Spam Rules

- **Idempotency**: Avoid showing the exact same toast multiple times in rapid succession.
- **Batching**: If multiple items fail or succeed simultaneously, group them into one toast.
  - *Good*: "3 orders updated."
  - *Bad*: 3 separate toasts popping up simultaneously saying "Order updated."
- **Debounce**: For repetitive actions (e.g., clicking a 'Copy Link' button quickly 5 times), only trigger one toast or reset the timer on the existing one. (Our implementation currently stacks, but auto-dismisses quickly. Ensure actions aren't unnecessarily spammy).

## UX Best Practices

- **Position**: Bottom-right corner (current implementation). It stays out of the way of primary central content.
- **Auto-Dismiss**: Success and Info toasts should dismiss automatically (e.g., 5 seconds). Errors might optionally be sticky, but in our current implementation, all auto-dismiss to prevent UI clutter.
- **Styling**: Must match the `rough-border` sketchy aesthetic of the app.
- **Accessibility**: Ensure sufficient color contrast. Success (Green), Error (Red), Warning (Yellow), Info (Blue) help quickly identify the severity. The layout should be simple enough for screen readers (using standard semantic HTML in the container).
