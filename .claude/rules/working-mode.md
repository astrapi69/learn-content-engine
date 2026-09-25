# Working mode with the owner: commands, questions, agents

Source: Asterios Raptis, 2026-09-24/25, in conversation ("alles bündeln,
keine Einzelabfragen mehr"; "shell-befehle bündeln für den ganzen prozess und
dann Bericht und dann kannst du loslegen"; "Du zeigst mir alle Befehle die du
ausführst vorher anstatt für jeden einzeln abzufragen"; "subagenten fragen
dich nicht mich"; "Alles was wir über die Befehle gesagt haben, das auch in
den claude rules festhalten").

Every shell command, every subagent action and every message to another
session can open a permission dialog for the owner. Each dialog interrupts
him. This rule keeps the dialogs few, predictable and matching what he saw.

## Shell commands: shown first, then run as announced

1. **Before a process** (a known sequence of work, such as "fix issue #N in
   the app" or "release X.Y.Z"), write every shell command it will run
   literally into the message: the commands themselves, not a description of
   them and not only the path of a script that contains them.
2. **Then stop and wait for the owner's go.** Do not start in the same
   message that announces the commands.
3. **After the go, run exactly those commands**, bundled: one tool call per
   step of the process, so each permission dialog shows one announced block.
   Run the block inline (the dialog then shows the commands), not through a
   script file whose content the dialog hides.
4. **Never run a different or a larger command than announced.** A command
   the process turns out to need is announced first, and waits for a go like
   the others.
5. **Steps that need an edit in between** (a RED test, then the fix) split a
   process into several announced blocks: the block before the edit, the
   block after it. Edits themselves go through the editor, not the shell.
6. **Outputs go to files**, read with the file-reading tool, instead of
   further shell calls to look at them.
7. **Heavy commands** (a build, a browser test run, a full suite): name the
   duration and the CPU load when announcing them, and run them with
   `nice -n 19` and one worker.

## Questions: none that the plan already answers

- Do not ask what the agreed order or a confirmed rule already answers
  ("shall I continue?" when the order is set is such a question).
- Real owner decisions (a design choice, a priority, a change to his
  settings) are collected and asked **together at the end of a work block**,
  never one per step. Work continues on everything that does not depend on
  them.
- Creating an issue still needs the owner's yes (with title, core and
  priority proposed), bundled like every other decision.

## Subagents and workflows

- A subagent's permission dialog reaches the owner, not the session that
  started it; the session cannot answer it. So no subagents and no
  workflows, **read-only ones included**, unless every command they use is
  already allowed in the project's permission settings.
- The owner agreed (2026-09-25) to an allowlist of the read-only commands
  subagents need; until it is in place, analyses run in the main session,
  under the command rules above.

## Other sessions

- No messages to other sessions: in the owner's setup each one opens a
  confirmation dialog. What another session needs to know goes into the
  report to the owner, who passes it on.
- The owner reads only the conversation with this session. "Put before him
  in another session" does not reach him.
