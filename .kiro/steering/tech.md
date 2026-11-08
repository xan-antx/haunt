# Haunt - Technology Stack

## Core Technologies

**Language:**  
TypeScript everywhere - for the engine, demo site, and dashboard.

**Runtime:**  
Node.js LTS (Long Term Support) version.

**Browser Automation:**  
Playwright for browser control and accessibility testing.

**Frontend Framework:**  
React with Vite for both:
- The demo site (example application being tested)
- The dashboard (results viewer)

## Development Principles

- Use TypeScript strict mode for type safety
- Leverage Playwright's accessibility testing capabilities
- Keep the React applications fast and modern with Vite's hot module replacement

## File Editing Rules

**CRITICAL**: Never create or edit files using shell commands such as `Set-Content`, `echo`, `Out-File`, or heredocs. Shell commands do not properly handle UTF-8 encoding, especially for special characters like currency symbols (₹).

**Always use the built-in file editing tools** for creating and modifying files. These tools:
- Save files with correct UTF-8 encoding
- Handle special characters properly
- Provide proper error handling
- Support multi-line content without escaping issues

**Use the terminal ONLY for**:
- Running npm commands (`npm install`, `npm run dev`, etc.)
- Running npx commands
- Running node commands
- Running read-only git commands (`git status`, `git diff`, `git log`)
- Other runtime operations that require a shell

**Never use the terminal for**:
- Creating files
- Editing files
- Writing content to files
- Appending to files

- Use built-in tools to read, list and search files. Use the terminal only for npm, npx and node commands, and for read-only git commands (`git status`, `git diff`, `git log`). Never run git commands that change the repository (commit, checkout, reset, push and similar) unless asked. Never use PowerShell commands like Get-ChildItem, Select-String or Get-Content.