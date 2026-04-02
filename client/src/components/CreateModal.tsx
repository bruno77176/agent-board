export function CreateModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-96">
        <p className="text-sm text-slate-500">Create modal — coming soon</p>
        <button onClick={onClose} className="mt-4 text-xs text-slate-400 hover:text-slate-600">Close</button>
      </div>
    </div>
  )
}
