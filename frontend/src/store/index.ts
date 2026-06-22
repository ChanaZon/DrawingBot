import { configureStore } from "@reduxjs/toolkit";
import {
  useDispatch,
  useSelector,
  type TypedUseSelectorHook,
} from "react-redux";
import drawingReducer from "./drawingSlice";

export const store = configureStore({
  reducer: { drawing: drawingReducer },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

// Typed hooks — use these instead of the plain react-redux hooks.
export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;

// Common selectors.
export const selectScene = (state: RootState) => state.drawing.scene;
export const selectCanUndo = (state: RootState) =>
  state.drawing.historyIndex >= 0;
export const selectCanRedo = (state: RootState) =>
  state.drawing.historyIndex < state.drawing.history.length - 1;
