Here is the analysis criteria document for evaluating the Agent Browser skill's performance:

**Performance Metrics**

* Time to complete a command (e.g., `agent-browser open <url>`)
* Number of elements successfully interacted with (e.g., `agent-browser click @e1`)
* Accuracy of snapshot outputs (e.g., `agent-browser snapshot -i`)
* Success rate of form submissions (e.g., `agent-browser fill @e1 "user@example.com"`)

**Quality Criteria for Outputs**

* Correctness of element refs (e.g., `@e1` vs. `@e2`)
* Accuracy of element properties (e.g., `agent-browser get text @e1`)
* Completeness of page snapshots (e.g., `agent-browser snapshot -i`)
* Consistency of form submissions (e.g., `agent-browser fill @e1 "user@example.com"`)

**Success/Failure Indicators**

* Command completion status (e.g., `agent-browser open <url>`: `success` or `failure`)
* Element interaction status (e.g., `agent-browser click @e1`: `success` or `failure`)
* Snapshot accuracy status (e.g., `agent-browser snapshot -i`: `accurate` or `inaccurate`)
* Form submission success rate (e.g., `agent-browser fill @e1 "user@example.com"`: `success` or `failure`)

**Optimization Targets**

* Minimize command execution time
* Maximize element interaction accuracy
* Minimize snapshot size and complexity
* Maximize form submission success rate

**Benchmark Test Cases (with sample inputs)**

### Navigation

* `agent-browser open https://example.com`
* `agent-browser open https://example.com/path`

### Snapshot

* `agent-browser snapshot -i`
* `agent-browser snapshot -c`
* `agent-browser snapshot -d 3`

### Form Submission

* `agent-browser fill @e1 "user@example.com"`
* `agent-browser fill @e2 "password123"`
* `agent-browser click @e3`

### Interaction

* `agent-browser click @e1`
* `agent-browser dblclick @e1`
* `agent-browser focus @e1`

### Video Recording

* `agent-browser record start ./demo.webm`
* `agent-browser record stop`
* `agent-browser record restart ./take2.webm`

### Wait

* `agent-browser wait @e1`
* `agent-browser wait 2000`
* `agent-browser wait --text "Success"`