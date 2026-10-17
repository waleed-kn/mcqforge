const maximumConcurrentDocuments = 2;

type ProcessingRuntime = typeof globalThis & {
  mcqforgeDocumentProcessing?: { active: number };
};

export function acquireDocumentProcessingSlot(): (() => void) | null {
  const runtime = globalThis as ProcessingRuntime;
  const state = (runtime.mcqforgeDocumentProcessing ??= { active: 0 });
  if (state.active >= maximumConcurrentDocuments) return null;

  state.active += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    state.active -= 1;
  };
}
