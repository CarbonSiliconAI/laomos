Here is the self-debug prompt:

**Self-Debug Prompt**
=====================

### Common Failure Modes

* `agent-browser` command not found
* Page not loaded or element not found
* Refs not updated after navigation
* Element not enabled or checked
* Network issues or page timing out

### Step-by-Step Debugging Checklist

1. **Verify Environment**:
	* Node.js version: `node -v`
	* npm version: `npm -v`
	* `agent-browser` version: `agent-browser -v`
2. **Check Command Syntax**:
	* Verify command syntax: `agent-browser <command> --help`
	* Check for typos or incorrect refs
3. **Inspect Page**:
	* Use `agent-browser snapshot -i` to inspect page elements
	* Verify refs are stable and updated after navigation
4. **Check Network**:
	* Verify network connectivity: `ping google.com`
	* Check for network timeouts or page timing out
5. **Troubleshoot Specific Issues**:
	* Check error messages and logs: `agent-browser console`
	* Use `agent-browser --headed` to show browser window for debugging

### Input/Output Validation Rules

* Verify input refs are correct and up-to-date
* Check for incorrect or missing refs
* Verify output formats (e.g., JSON) are correct

### Environment Requirements

* Node.js version 14.17.0 or later
* npm version 6.14.17 or later
* `agent-browser` version 1.2.3 or later

### Fallback Strategies

* If `agent-browser` command not found, install using `npm install -g agent-browser`
* If page not loaded or element not found, use `agent-browser snapshot -i` to inspect page elements
* If network issues or page timing out, use `agent-browser --timeout` to set command timeout
* If element not enabled or checked, use `agent-browser click` or `agent-browser check` to interact with element