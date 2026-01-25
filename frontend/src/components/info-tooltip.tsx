import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'

interface InfoTooltipProps {
	/** Short explanation for the parent label or value. Shown on hover/focus. */
	content: string
	/** Optional class for the trigger button. */
	className?: string
}

const GAP = 6

/**
 * Small (?) icon that shows a tooltip on hover or focus. Renders the tooltip
 * in a portal so it is not clipped by overflow on parents (e.g. table wrappers).
 */
export function InfoTooltip({ content, className = '' }: InfoTooltipProps) {
	const [visible, setVisible] = useState(false)
	const [placement, setPlacement] = useState<{ left: number; bottom: number } | null>(null)
	const buttonRef = useRef<HTMLButtonElement>(null)

	function open() {
		const rect = buttonRef.current?.getBoundingClientRect()
		if (rect) {
			setPlacement({
				left: rect.left + rect.width / 2,
				bottom: window.innerHeight - rect.top + GAP,
			})
			setVisible(true)
		}
	}

	function close() {
		setVisible(false)
		setPlacement(null)
	}

	const tooltipEl =
		visible &&
		placement &&
		typeof document !== 'undefined' &&
		createPortal(
			<span
				className="fixed min-w-[200px] max-w-[320px] px-3 py-2 text-xs leading-snug text-left rounded shadow-lg bg-gray-900 dark:bg-gray-700 text-white dark:text-gray-100 z-[9999] whitespace-normal"
				role="tooltip"
				style={{
					left: placement.left,
					bottom: placement.bottom,
					transform: 'translateX(-50%)',
				}}
			>
				{content}
			</span>,
			document.body
		)

	return (
		<span className={`relative inline-flex ${className}`}>
			<button
				ref={buttonRef}
				type="button"
				className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-semibold bg-gray-300 dark:bg-gray-600 text-gray-600 dark:text-gray-300 cursor-help hover:bg-gray-400 dark:hover:bg-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-indigo-500 dark:focus:ring-offset-gray-800"
				aria-label={content}
				onMouseEnter={open}
				onMouseLeave={close}
				onFocus={open}
				onBlur={close}
			>
				?
			</button>
			{tooltipEl}
		</span>
	)
}
