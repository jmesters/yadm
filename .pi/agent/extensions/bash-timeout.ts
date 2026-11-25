/**
 * Default timeout for bash tool calls.
 *
 * Pi's bash tool has no timeout unless the model passes one, so a hung
 * script blocks the session until the user presses Esc (queued messages
 * wait for the tool call to finish). This fills in a default when the call
 * has none; on timeout pi kills the whole process tree and returns the
 * output so far. Long jobs should run in the background instead
 * (`nohup cmd > /tmp/x.log 2>&1 & echo $!`), which this does not touch.
 *
 * Override the default with PI_BASH_DEFAULT_TIMEOUT (seconds, 0 = off).
 */

import { type ExtensionAPI, isToolCallEventType } from "@earendil-works/pi-coding-agent";

const DEFAULT_SECONDS = Number(process.env.PI_BASH_DEFAULT_TIMEOUT ?? 600);

export default function (pi: ExtensionAPI) {
	if (!(DEFAULT_SECONDS > 0)) return;

	pi.on("tool_call", async (event) => {
		if (!isToolCallEventType("bash", event)) return;
		const t = event.input.timeout;
		if (typeof t !== "number" || !(t > 0)) event.input.timeout = DEFAULT_SECONDS;
	});
}
