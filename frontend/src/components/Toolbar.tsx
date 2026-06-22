import {
  selectCanRedo,
  selectCanUndo,
  useAppDispatch,
  useAppSelector,
} from "../store";
import { clear, redo, undo } from "../store/drawingSlice";

// Phase 2 controls: history navigation + clear. Wired straight to the store.
export function Toolbar() {
  const dispatch = useAppDispatch();
  const canUndo = useAppSelector(selectCanUndo);
  const canRedo = useAppSelector(selectCanRedo);
  const hasScene = useAppSelector((s) => s.drawing.scene.length > 0);

  return (
    <div className="flex items-center gap-2">
      <ToolbarButton
        label="Undo"
        disabled={!canUndo}
        onClick={() => dispatch(undo())}
      />
      <ToolbarButton
        label="Redo"
        disabled={!canRedo}
        onClick={() => dispatch(redo())}
      />
      <ToolbarButton
        label="Clear"
        disabled={!hasScene}
        onClick={() => dispatch(clear())}
      />
    </div>
  );
}

type ToolbarButtonProps = {
  label: string;
  disabled: boolean;
  onClick: () => void;
};

function ToolbarButton({ label, disabled, onClick }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {label}
    </button>
  );
}
