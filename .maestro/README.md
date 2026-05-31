# Maestro flows — parent app E2E

E2E smoke tests for the Pedia Pulse parent React Native app, driven by
[Maestro](https://maestro.mobile.dev).

## Install Maestro (one-time, your machine)

```bash
# macOS (recommended)
brew tap mobile-dev-inc/tap
brew install maestro

# Verify
maestro --version
```

## Prereqs to run

1. **An iOS simulator or Android emulator booted**, with **Expo Go**
   installed and the project loaded:
   ```bash
   # In one terminal
   npx expo start
   # Press `i` (iOS sim) or `a` (Android emulator) to open the project
   ```
2. The app needs to be visible on the simulator before running flows.
3. `tests/.env` populated if you add API-driven tests later (none yet).

## Run

```bash
# Single flow
maestro test .maestro/01-cold-start.yaml

# All flows (uses config.yaml ordering)
maestro test .maestro

# Filter by tags
maestro test .maestro --include-tags=smoke
maestro test .maestro --include-tags=parent,auth
```

## What's covered

| Flow | What it asserts |
| --- | --- |
| `01-cold-start.yaml` | App launches without crash; lands on auth OR home |
| `02-signup-form.yaml` | Signup form accepts name + phone; OTP screen renders. Stops before OTP entry. |
| `03-onboarded-home.yaml` | Home greeting, quick actions, AI check-in entry, tabs nav |

## Caveats

- **OTP isn't automated**. Twilio Verify ships actual SMS; tests would need
  a Twilio Verify *test credential* (`https://console.twilio.com/.../verify`)
  configured to accept a fixed code like `123456` without sending SMS.
  For now the signup flow stops at the OTP screen.
- **`appId: host.exp.Exponent`** runs against Expo Go. Once you
  `npx expo run:ios` or `eas build` to get a real dev client, update the
  `appId` in each flow to your bundle id (`com.pediapulse.lilsteps`).
- **testID** props: flows assume tab `id` props (`growth`, `records`,
  `index`) and form input `id` props (`name`, `phone`). Add `testID` to
  the relevant components if Maestro can't find them.
