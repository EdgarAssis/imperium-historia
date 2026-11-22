// src/lib/state/index.ts
// Reexporta o que os componentes vão usar.
export {
  useGameStore,
  createInitialState,
  type GameStore,
  type NewGameInput,
} from "./store";
export {
  saveToSlot,
  loadFromSlot,
  listSlots,
  deleteSlot,
  exportToFile,
  importFromFile,
  autosave,
  loadAutosave,
  clearAutosave,
  SAVE_VERSION,
  type SaveSlot,
  type SaveSlotMeta,
} from "./save";
export { addDays, addMonths, addYears, formatDatePT } from "./date";
