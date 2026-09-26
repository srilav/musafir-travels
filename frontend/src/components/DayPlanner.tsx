import { useId, useState, type FormEvent } from 'react'
import { getErrorMessage } from '../api/client'
import { useAddActivity } from '../api/trips'
import { formatLongDateWithWeekday } from '../lib/dates'
import { buttonPrimary, inputBase } from '../lib/styles'
import type { Day } from '../types'
import { ActivityInput } from './ActivityInput'

interface DayPlannerProps {
  tripId: string
  day: Day
  expanded: boolean
  onToggle: () => void
}

export function DayPlanner({ tripId, day, expanded, onToggle }: DayPlannerProps) {
  const id = useId()
  const [newText, setNewText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const add = useAddActivity(tripId)
  const panelId = `${id}-panel`

  function handleAdd(event: FormEvent) {
    event.preventDefault()
    const text = newText.trim()
    if (!text) {
      setError('Type an activity first.')
      return
    }
    setError(null)
    add.mutate(
      { dayId: day.id, text },
      {
        onSuccess: () => setNewText(''),
        onError: (err) => setError(`Couldn’t add the activity: ${getErrorMessage(err)}`),
      },
    )
  }

  return (
    <section className="rounded-lg border border-border bg-surface">
      <h3>
        <button
          type="button"
          className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left focus-visible:outline-2 focus-visible:outline-primary"
          aria-expanded={expanded}
          aria-controls={panelId}
          onClick={onToggle}
        >
          <span>
            <span className="block font-semibold text-primary">Day {day.day_number}</span>
            <span className="block text-sm text-text-muted">{formatLongDateWithWeekday(day.date)}</span>
            {!expanded && day.activities.length > 0 && (
              <span className="mt-1 block text-sm text-text">
                {day.activities
                  .slice(0, 3)
                  .map((activity) => activity.text)
                  .join(' · ')}
                {day.activities.length > 3 && ` · +${day.activities.length - 3} more`}
              </span>
            )}
          </span>
          <span className="shrink-0 text-sm text-text-muted">
            {day.activities.length} {day.activities.length === 1 ? 'activity' : 'activities'}{' '}
            <span aria-hidden="true">{expanded ? '▴' : '▾'}</span>
          </span>
        </button>
      </h3>
      {expanded && (
        <div id={panelId} className="space-y-3 border-t border-border px-4 py-3">
          {day.activities.length > 0 ? (
            <ul className="space-y-2">
              {day.activities.map((activity, index) => (
                <ActivityInput key={`${activity.id}:${activity.text}`} tripId={tripId} activity={activity} index={index} />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-text-muted">No activities planned yet.</p>
          )}
          <form onSubmit={handleAdd} className="flex flex-col gap-2 sm:flex-row">
            <label htmlFor={`${id}-new`} className="sr-only">
              New activity for Day {day.day_number}
            </label>
            <input
              id={`${id}-new`}
              className={inputBase}
              placeholder="Add an activity"
              value={newText}
              onChange={(event) => setNewText(event.target.value)}
            />
            <button type="submit" className={buttonPrimary} disabled={add.isPending}>
              {add.isPending ? 'Adding…' : 'Add'}
            </button>
          </form>
          {error && (
            <p role="alert" className="text-sm text-error">
              {error}
            </p>
          )}
        </div>
      )}
    </section>
  )
}
