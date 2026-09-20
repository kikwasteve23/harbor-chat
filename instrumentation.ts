export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initStore } = await import("./lib/store");
    await initStore();
    const { startActivityLoop } = await import("./lib/activity-loop");
    startActivityLoop();
  }
}
