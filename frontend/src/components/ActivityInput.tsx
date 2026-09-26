import { useId, useState } from 'react'
import { getErrorMessage } from '../api/client'
import { useDeleteActivity, useUpdateActivity } from '../api/trips'
import { inputBase } from '../lib/styles'
import type { Activity } from '../types'

interface ActivityInputProps {
  tripId: string
  activity: Activity
  index: number
}

/** One editable activity row: saves on blur/Enter, with delete. */
export function ActivityInput({ tripId, activity, index }: ActivityInputProps) {
  const id = useId()
  const [text, setText] = useState(activity.text)
  const [error, setError] = useState<string | null>(null)
  const update = useUpdateActivity(tripId)
  const remove = useDeleteActivity(tripId)

  function save() {
    const trimmed = text.trim()
    if (trimmed === activity.text) return
    if (!trimmed) {
      setError('Activity can’t be empty. Use Delete to remove it.')
      setText(activity.text)
      return
    }
    setError(null)
    update.mutate(
      { activityId: activity.id, text: trimmed },
      { onError: (err) => setError(`Couldn’t save: ${getErrorMessage(err)}`) },
    )
  }

  return (
    <li className="space-y-1">
      <div className="flex items-center gap-2">
        <label htmlFor={id} className="sr-only">
          Activity {index + 1}
        </label>
        <input
          id={id}
          className={inputBase}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onBlur={save}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
              event.preventDefault()
              save()
            }
          }}
          disabled={remove.isPending}
        />
        <button
          type="button"
          className="rounded-md px-2 py-2 text-sm font-medium text-error hover:bg-background focus-visible:outline-2 focus-visible:outline-error disabled:opacity-50"
          onClick={() =>
            remove.mutate(activity.id, { onError: (err) => setError(`Couldn’t delete: ${getErrorMessage(err)}`) })
          }
          disabled={remove.isPending}
          aria-label={`Delete activity ${index + 1}`}
        >
          Delete
        </button>
      </div>
      {update.isPending && <p className="text-xs text-text-muted">Saving…</p>}
      {error && (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      )}
    </li>
  )
}
