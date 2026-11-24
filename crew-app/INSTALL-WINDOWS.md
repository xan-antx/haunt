# Installing Haunt Patrol on Windows 11

This guide installs Haunt Patrol into the Kiro Crew desktop app. The desktop app runs the Crew
gateway itself, so you never start a gateway by hand and you do not need the `kirocrew` command.
Every command below is for Windows PowerShell 5.1 (the PowerShell that ships with Windows 11) and
also works in PowerShell 7. Commands that call a web address use `curl.exe`, never plain `curl`,
because in Windows PowerShell 5.1 `curl` is an alias for `Invoke-WebRequest`.

The examples use `C:\Users\Lenovo\Projects\haunt` as the Haunt repository folder. Use the folder you
cloned into instead.

## If you don't have Kiro Crew yet

1. Download the signed Windows installer for the Kiro Crew desktop app from
   [kiro.dev/docs/crew/installation](https://kiro.dev/docs/crew/installation/) and run it.
2. Open Kiro Crew and finish the setup screen, including the Kiro CLI sign-in. The desktop app
   includes its own Kiro CLI, so nothing else is needed for Crew itself.
3. Install [Node.js 24 LTS](https://nodejs.org) and [Git for Windows](https://git-scm.com/download/win),
   then open a new PowerShell window and check both:

   ```powershell
   node --version
   git --version
   ```

   `node --version` must print `v24` or later.
4. Clone the Haunt repository and install what the patrol needs. Haunt Patrol never installs
   anything itself.

   ```powershell
   git clone https://github.com/xan-antx/haunt.git C:\Users\Lenovo\Projects\haunt
   Set-Location C:\Users\Lenovo\Projects\haunt\engine
   npm install
   npx playwright install chromium
   Set-Location ..\demo-site
   npm install
   Set-Location ..\crew-app
   npm install
   ```

   The page bundle `crew-app\ui\dist\index.mjs` is committed to the repository, so there is no build
   step.

## 1. Tell Haunt Patrol where the repository is

Crew installs a copy of `crew-app` into `%USERPROFILE%\.kiro\crew\apps\haunt-patrol`. That copy has no
`engine\` or `demo-site\` next to it, so the nightly patrol finds the repository through the
`HAUNT_REPO_ROOT` environment variable. Set it once for your Windows user:

```powershell
[Environment]::SetEnvironmentVariable('HAUNT_REPO_ROOT', 'C:\Users\Lenovo\Projects\haunt', 'User')
```

Programs only see a new variable when they start, so fully quit Kiro Crew now: right-click its icon
in the notification area and choose Quit (closing the window may leave it running). Then open Kiro
Crew again from the Start menu.

## 2. Make sure the gateway is online

Open the Kiro Crew desktop app and wait until the dashboard has loaded. Then check that the gateway
answers on its default port, 5476:

```powershell
curl.exe -s -o NUL -w "%{http_code}`n" http://127.0.0.1:5476/api/status
```

Any HTTP status, such as `200` or `401`, means the gateway is online. `401` only means the request
carried no dashboard sign-in, which is expected from PowerShell. `000` means nothing is listening:
open the desktop app and wait for it to finish starting, then try again. You can also check the port
without curl:

```powershell
Test-NetConnection -ComputerName 127.0.0.1 -Port 5476 | Select-Object TcpTestSucceeded
```

`TcpTestSucceeded : True` means the gateway is listening.

## 3. Install Haunt Patrol from the local path

Crew's install and enable API routes need a dashboard sign-in, so a plain `curl.exe` request cannot
install the app. Use the dashboard:

1. In the Kiro Crew sidebar, open **Apps**.
2. On the **Library** or **Discover** tab, open the sources menu and choose **Install from local path**.
3. Enter the `crew-app` folder, the one that holds `app.json`:

   ```text
   C:\Users\Lenovo\Projects\haunt\crew-app
   ```

4. Confirm the install. Crew checks `app.json`, copies the folder into
   `%USERPROFILE%\.kiro\crew\apps\haunt-patrol`, and leaves the app disabled. If the manifest has a
   problem, the install message names the field.

To confirm the copy landed:

```powershell
Test-Path "$env:USERPROFILE\.kiro\crew\apps\haunt-patrol\ui\dist\index.mjs"
```

It prints `True` when the page bundle was copied.

## 4. Enable Haunt Patrol

1. In **Apps → Library**, find the **Haunt Patrol** tile and choose **Enable**.
2. Crew asks whether to trust this app. Third-party apps cannot run code until you trust them, so
   accept the prompt for Haunt Patrol only. You can revoke the grant later under
   **Settings → Security → Third-party apps**.

After enabling, Crew starts the app's small read-only backend and registers its nightly schedule.

## 5. Open the Haunt Patrol page

Choose **Haunt Patrol** in the sidebar, or **Open** on its Library tile. The sidebar row uses Crew's
generic app icon, because named sidebar icons are only drawn for built-in apps.

Before the first patrol the page says **No patrol has run yet.**

## 6. Trigger one patrol by hand

1. Make sure nothing else is using port 3000, because the patrol serves Lantern Bills there. This
   command prints nothing when the port is free:

   ```powershell
   Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
   ```

2. Open the **Schedule** page in the Crew sidebar and find the job **nightly-patrol**. It shows
   `0 0 * * *` in the `Asia/Kolkata` time zone with an **Exact time** badge.
3. Choose **Run now**. The patrol builds Lantern Bills, sends The Listener, The Phantom and Bebe
   through the pay-bill mission one after another, and stops the site. This takes a few minutes and
   at most 15.
4. Open the job's **Logs** tab. The run shows **OK** with the patrol summary as its result when at
   least one ghost saved a run, and **Error** otherwise, with the reason as the run's error. Crew
   also sends the summary as a notification.
5. Go back to the Haunt Patrol page and reload it. It shows tonight's date in IST, the summary, and
   one row per ghost with its result and finding counts. Choose **Show findings** on a row to list that
   ghost's findings. One link at the bottom opens the live Haunt dashboard, which shows the recorded
   demo runs, not the patrol's own runs.

Everything a patrol writes stays in the installed copy, under
`%USERPROFILE%\.kiro\crew\apps\haunt-patrol\data\`: the ghost runs in `runs\`, the patrol record and
summary in `patrols\`, and a log of every step in `logs\patrol.log`. The repository's `runs\` folder,
which the dashboard shows, is never changed. To read the latest summary or the log without the page:

```powershell
notepad "$env:USERPROFILE\.kiro\crew\apps\haunt-patrol\data\patrols\summary.md"
notepad "$env:USERPROFILE\.kiro\crew\apps\haunt-patrol\data\logs\patrol.log"
```

Running `npm run patrol` in `crew-app\` also runs a patrol, but it writes to the repository's
`crew-app\data\patrols\`, which the installed app does not read. Use **Run now** to fill the page.

## Troubleshooting

| What you see | What to do |
|---|---|
| Anything fails | Open `data\logs\patrol.log` in the installed copy (step 6). It lists the repository root, the node path, the command, the exit code and the patrol's output for every run. |
| The run fails with "HAUNT_REPO_ROOT is not set" | The patrol did not see `HAUNT_REPO_ROOT`. Check it with `[Environment]::GetEnvironmentVariable('HAUNT_REPO_ROOT', 'User')`. Quit Kiro Crew from the notification area and open it again. |
| The run fails with "HAUNT_REPO_ROOT is set to ..., but that folder does not exist" or "cannot find the engine" | `HAUNT_REPO_ROOT` must name the folder that holds `engine\` and `demo-site\`. Fix it with the command in step 1, then quit and reopen Kiro Crew. |
| The run fails with "Haunt Patrol cannot find node on PATH" | Install Node.js 24 LTS, then quit and reopen Kiro Crew so it sees the new `PATH`. |
| The run fails with exit code 1 | A prerequisite is missing. The trace lists each missing item with the command that fixes it, for example `npx playwright install chromium` in `engine\`. |
| The run fails with exit code 2 | The site did not start. Most often port 3000 is in use; see step 6. |
| The run fails with exit code 3 | The site started but no ghost saved a run. The trace has each ghost's error. |
| The run fails with exit code 4 | The patrol crashed. The trace has the error text. |
| The run or the backend is refused with a message about unsandboxed execution | Windows has no Crew sandbox, and this machine's Crew settings refuse unsandboxed app code (`sandbox_allow_unsandboxed_exec` is `false`). Haunt Patrol needs that allowed. |
| You changed files in `crew-app\` and Crew still shows the old version | Choose **Update** on the Haunt Patrol tile in **Apps → Library**. The update keeps the patrol records, runs and logs in `data\`. |

`crew-app\README.md` explains the exit codes and the patrol in more detail.
