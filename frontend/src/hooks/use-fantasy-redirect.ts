import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

/**
 * Sends the viewer to the live draft when an event has fantasy predictions turned off.
 *
 * Those events use the tool for the draft alone, so the event detail, prediction, and
 * stats pages have nothing to show. The home page links straight past them; this covers
 * direct links, bookmarks, and anyone typing the URL.
 *
 * Pass `undefined`/`null` while the event is still loading — only an explicit `false`
 * redirects, so an event loaded before this field existed keeps the old behaviour.
 */
export function useFantasyRedirect(
	fantasyEnabled: boolean | null | undefined,
	eventCode: string | undefined,
): void {
	const navigate = useNavigate()

	useEffect(() => {
		if (!eventCode || fantasyEnabled !== false) return
		navigate(`/event/${eventCode}/draft`, { replace: true })
	}, [fantasyEnabled, eventCode, navigate])
}
