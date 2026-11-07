// adbd's tcpip: and usb: services write one line and then restart adbd. The
// restart can win the race, so the line may arrive cut off anywhere, or not
// at all, although the switch happened. adb itself ignores the output.
//
// So only adbd's own error replies count as failures. In adbd's
// restart_service.cpp, tcpip: with a port <= 0 answers "invalid port <port>"
// ("invalid port" before Android 5); usb: always succeeds. A port that isn't
// a number makes the service fail to start, which arrives as a FAIL and is
// handled by the commands.
const ERROR_REPLY = /^invalid port\b/;

/**
 * Throws with adbd's message if the output of tcpip: or usb: is one of its
 * error replies; any other output, including none, means success.
 */
export function checkRestartReply(value: Buffer): void {
  const output = value.toString().trim();
  if (ERROR_REPLY.test(output)) {
    throw new Error(output);
  }
}
