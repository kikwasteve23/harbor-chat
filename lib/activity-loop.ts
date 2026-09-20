let started = false;

export function startActivityLoop() {
  if (started) return;
  started = true;
  const tickMs = 20_000;
  const run = async () => {
    try {
      const { bootstrapIfNeeded } = await import("./bootstrap");
      await bootstrapIfNeeded();
      const { tickActivity } = await import("./platform");
      await tickActivity();
    } catch (err) {
      console.error("activity loop", err);
    }
  };
  void run();
  setInterval(() => {
    void run();
  }, tickMs);
}
