# Memos Behavior Spec

This file states what Memos is expected to do for the person that Haunt sends in: The Listener, who uses a screen reader's view and the keyboard, and works without a mouse. Each requirement has an identifier that the `write-note` mission cites.

## MEMOS-1: Saving a note

WHEN a signed-in user types a note in the note editor and activates Save, THE Memos application SHALL add a new memo with that text at the top of the memo list. The new memo SHALL appear without the user leaving the page.

## MEMOS-2: Moving focus out of the note editor

WHILE keyboard focus is in the note editor, WHEN the user presses Tab or Shift+Tab, THE Memos application SHALL move focus to the next or the previous control. The editor SHALL NOT keep focus after either key.

## MEMOS-3: Naming the note editor

THE Memos application SHALL give the note editor an accessible name that a screen reader announces when focus enters it. The name SHALL say what the editor is for, so that a person who cannot see the page knows where to write.
