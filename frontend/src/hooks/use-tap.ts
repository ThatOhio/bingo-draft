import { useCallback, useRef } from 'react'

/** Matches the PointerSensor activation distance: past this, it was a drag, not a tap. */
const TAP_MOVE_TOLERANCE_PX = 8

interface TapHandlers {
	onPointerDownCapture: (e: React.PointerEvent) => void
	onClick: (e: React.MouseEvent) => void
}

/**
 * Tap handling for an element that is also a @dnd-kit draggable. dnd-kit lets the native
 * click through after a drag finishes, so a plain onClick would also fire when the user
 * only meant to move the chip. Recording the pointer origin in the capture phase avoids
 * colliding with the sensor's own onPointerDown listener.
 */
export function useTap(onTap: (() => void) | undefined): TapHandlers {
	const originRef = useRef<{ x: number; y: number } | null>(null)

	const onPointerDownCapture = useCallback((e: React.PointerEvent) => {
		originRef.current = { x: e.clientX, y: e.clientY }
	}, [])

	const onClick = useCallback(
		(e: React.MouseEvent) => {
			const origin = originRef.current
			originRef.current = null
			if (!onTap) {
				return
			}
			if (origin) {
				const moved =
					Math.abs(e.clientX - origin.x) > TAP_MOVE_TOLERANCE_PX ||
					Math.abs(e.clientY - origin.y) > TAP_MOVE_TOLERANCE_PX
				if (moved) {
					return
				}
			}
			onTap()
		},
		[onTap]
	)

	return { onPointerDownCapture, onClick }
}
