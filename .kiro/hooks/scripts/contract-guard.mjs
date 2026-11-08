// PreToolUse guard: ask the user before any write touching contract/.
// Reads the hook JSON from stdin and checks only path-like fields of the tool input.
let raw = '';
process.stdin.setEncoding('utf8');
for await (const chunk of process.stdin) raw += chunk;

let payload = {};
try {
  payload = JSON.parse(raw);
} catch {
  // Unparseable input: fall through and allow.
}

const input = payload.tool_input ?? payload.toolInput ?? payload.input ?? payload.arguments ?? {};
const pathKeys = ['path', 'targetFile', 'file_path', 'filePath', 'sourcePath', 'destinationPath'];
const touchesContract = pathKeys.some(key => {
  const value = input[key];
  if (typeof value !== 'string') return false;
  return /(^|\/)contract\//.test(value.replace(/\\/g, '/'));
});

if (touchesContract) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'ask',
        permissionDecisionReason:
          'contract/ is shared between Ghost Builder and House Builder. Confirm this change before it is written.',
      },
    }),
  );
}
process.exit(0);
