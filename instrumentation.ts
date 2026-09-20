export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startActivityLoop } = await import("./lib/activity-loop");
    startActivityLoop();
  }
}
