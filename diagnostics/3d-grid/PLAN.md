# Private matched-host grid-sampler counterfactual

Nothing committed, pushed or dispatched. This is not upstream Required CI.

The sole macos-latest job checks out exact public e4ab550833e80c0ed9123c7320210cc070d4ef2c and uses the upstream Node26/Bun1.4.3, locked install, Playwright install and13-task web-renderer make closure. No shader, fixture, native-capture, test assertion, cap or browser flag changes. Candidate changes are only the three hash-checked reviewed production files, applied from source-review.patch. The highp shader strings remain unchanged.

The separately copied observer forwards actual drawArrays/drawImage calls and captures bound MIN/MAG, dimensions, uResolution and actual9-argument parent copy phase. It restores spies in finally and retains original encoded native/actual PNGs on success and failure, existing GPU diagnostics and runtime/DPR.

Baseline must first reproduce32passed/2failed/38skipped and BOTH exact old Firefox400/max60 comparison artifacts plus their encoded reference/actual hashes. Candidate cannot start after a setup or baseline-gate failure. Candidate must produce34passed/0failed/38skipped, actually execute NEAREST with a recorded copy, preserve all captured reference/default hashes, and retain every positive original PNG. WebKit’s existing missing Canvasfilter API skips remain unchanged. All files restore in finally; artifacts upload even if a gate fails.

The workflow does not claim independent candidate native parity from exit status. Downloaded originals must independently decode RGBA0 for both reported frames and preserve native/default references before any publication decision. Existing local396standard triples +132physical triples are preserved; the WK1.25 original305-pixel reference-preservation gate remains recorded as failed. Narrow baseline controls reproduce242pixels of that variation without the sampler;63/max1 remains unassigned. No rebaseline.

Only this new fork feature branch would be pushed after ROOT review. No current approval to commit, push or dispatch. No Linux26unsupported matrix, AWS/private assets/secrets, default-branch changes, retries or upstream reruns.
