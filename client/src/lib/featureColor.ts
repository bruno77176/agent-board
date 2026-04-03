const PALETTE = [
  { bg: 'bg-blue-100',   text: 'text-blue-700',   border: 'border-l-blue-400'   },
  { bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-l-purple-400' },
  { bg: 'bg-green-100',  text: 'text-green-700',  border: 'border-l-green-400'  },
  { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-l-orange-400' },
  { bg: 'bg-pink-100',   text: 'text-pink-700',   border: 'border-l-pink-400'   },
  { bg: 'bg-teal-100',   text: 'text-teal-700',   border: 'border-l-teal-400'   },
  { bg: 'bg-amber-100',  text: 'text-amber-700',  border: 'border-l-amber-400'  },
  { bg: 'bg-indigo-100', text: 'text-indigo-700', border: 'border-l-indigo-400' },
]

/** Returns a stable color theme for a given feature ID. Same ID always returns same color. */
export function featureColor(featureId: string) {
  let hash = 0
  for (let i = 0; i < featureId.length; i++) {
    hash = (hash * 31 + featureId.charCodeAt(i)) >>> 0
  }
  return PALETTE[hash % PALETTE.length]
}
