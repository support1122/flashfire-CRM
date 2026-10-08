import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import MarkPresentCard from './MarkPresentCard';
import MyAttendancePanel from './MyAttendancePanel';

function MyAttendanceDialog({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (el && !el.open) el.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby="my-attendance-title"
      onClose={onClose}
      // A click on the backdrop lands on the dialog element itself, not on its content.
      onClick={(e) => {
        if (e.target === ref.current) ref.current?.close();
      }}
      className="m-auto w-[min(72rem,calc(100vw-2rem))] max-h-[calc(100vh-2rem)] overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-0 shadow-2xl backdrop:bg-black/40"
    >
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-2.5 sm:px-6">
        <p id="my-attendance-title" className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Attendance
        </p>
        <button
          type="button"
          onClick={() => ref.current?.close()}
          aria-label="Close"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      <div className="max-h-[calc(100vh-6.5rem)] overflow-y-auto">
        <MyAttendancePanel />
      </div>
    </dialog>
  );
}

/**
 * The BDA-facing attendance strip for the CRM shell: the Mark Present card on every tab,
 * with a button that opens "My attendance". Renders nothing for people who are not tracked.
 */
export default function BdaAttendanceStrip() {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex-shrink-0 border-b border-gray-200 bg-gray-100 px-4 py-3 sm:px-6 lg:px-10 empty:hidden">
      <MarkPresentCard onOpenMyAttendance={() => setOpen(true)} />
      {open && <MyAttendanceDialog onClose={() => setOpen(false)} />}
    </div>
  );
}
