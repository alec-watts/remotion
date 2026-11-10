# Private mask timeout workload observation

This capsule is prepared for a single manual fork run, pending ROOT review. No diagnostic result or timeout fix is claimed.

The failed upstream run42780836429/job129710483252 checked out merge54b33d97721f1f0ca88ad42e533c9fe319c8867e. Its tree afda10b1f802cc20f7e655281b24bc31fce1e3fb is identical to public11dd229a8eacc2bc400e0e938cc969d3a9fd3f64. The workflow checks out the exact merge into source/ and the separate fork capsule into capsule/. No latest-main dependency.

Original root command, three browser projects, worker configuration, assertions, fixtures, skips and deadlines remain. The only config addition is a passive reporter alongside default. Only transparent-multiple frame0 receives stage/Blob observation; the other original callbacks are unchanged. All original await expressions/assertions are AST-checked. No production/native helper code changes. No extra browser launch for version metadata.

The original Firefox transparent branch has no native screenshot: expected completed observations are36stages/4Blobs versus42/6 in Chromium/WebKit. Partial timeout records are retained as incomplete, never synthesized. A failing summary gate does not turn a test failure into a setup success, or vice versa. The original test command exit is preserved by pipefail. afterEach only reads existing retained Blobs, without another render/encode.

Actual prior hosted image was macos-26-arm64/26.7.2. macos-latest may advance. Node26.13.0/Bun1.4.3 and all action revisions are pinned to observed versions. Browser version is read from installed Chrome metadata, not launched. Playwright install remains original. Fork artifacts/observations cannot prove upstream Required CI green.

Pinned cache-action audit:0abc2381e688c4d2832f0665a68a01c6e82f0d6c src/main.ts calls launchServer; src/lib/server/utils.ts exports TURBO_API/TOKEN/TEAM into following steps. constants.ts uses RUNNER_TEMP for temporary storage and task hash for cache key; it does not discover repository lockfiles or cwd. action.yml has no workingDirectory input. Nested source working-directory inherits those variables; no override is required. Same cache mechanism is retained, not guaranteed cache contents: fork scope and observer source changes can alter hits and task inputs. Original13make tasks hit cache; report actual diagnostic graph/hits rather than claiming matched cache/prior load. No cache bypass/force in hosted workflow.

The observer necessarily adds logging, Blob retention, and a no-op afterEach for other cases in the same file. Reporter timestamps reflect event delivery and do not pretend to measure browser wall-clock scheduling exactly. No asserted timeout cause, memory leak, pixel parity expansion, or automatic rerun.

Local qualification uses independent3655 frozen dependencies and its own forced13-task build/local Turbo cache. All13make commands executed under --force (0Turbo cache hits; compiler-internal caching is not asserted); instrumented full source/config/reporter TSC and scoped source ESLint pass. Config/reporter have no matching stock ESLint config and are typechecked/formatted separately; this is explicit, not claimed as stock lint coverage. No local browser execution.
