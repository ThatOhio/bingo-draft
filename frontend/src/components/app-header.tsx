import { type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../contexts/auth-context'
import { DarkModeToggle } from './dark-mode-toggle'

interface AppHeaderProps {
	/** Link for the "← Back" button. When set, shows Back on the left. */
	backLink?: string
	/** Title shown on the left (app name, page name, or event name). */
	title?: string
	/** When set, the title becomes a link to this path (e.g. "/" for the app name on home). */
	titleHref?: string
	/** Optional node rendered after DarkModeToggle and before Welcome/Admin/Logout (e.g. draft controls). */
	rightSlot?: ReactNode
}

export function AppHeader({ backLink, title, titleHref, rightSlot }: AppHeaderProps) {
	const { user, logout } = useAuth()
	const navigate = useNavigate()
	const { eventCode } = useParams<{ eventCode?: string }>()
	const loginTo = eventCode ? `/login?eventCode=${eventCode}` : '/login'

	const handleLogout = () => {
		logout()
		navigate('/login')
	}

	return (
		<nav className="bg-white dark:bg-gray-800 shadow dark:shadow-gray-900/50">
			<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
				<div className="flex justify-between h-16">
					<div className="flex items-center">
						{backLink && (
							<Link
								to={backLink}
								className="text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 mr-4"
							>
								← Back
							</Link>
						)}
						{title && (
							titleHref ? (
								<Link
									to={titleHref}
									className={
										'text-xl font-bold text-gray-900 dark:text-gray-100 ' +
										'hover:text-gray-700 dark:hover:text-gray-300'
									}
								>
									{title}
								</Link>
							) : (
								<h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">{title}</h1>
							)
						)}
					</div>
					<div className="flex items-center space-x-2 sm:space-x-4">
						<DarkModeToggle />
						{rightSlot}
						{user ? (
							<>
								<span className="text-gray-700 dark:text-gray-300">Welcome, {user.discordUsername}</span>
								{user.role === 'ADMIN' && (
									<Link
										to="/admin"
										className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300"
									>
										Admin
									</Link>
								)}
								<button
									onClick={handleLogout}
									className="text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
								>
									Logout
								</button>
							</>
						) : (
							<Link
								to={loginTo}
								className="text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
							>
								Login
							</Link>
						)}
					</div>
				</div>
			</div>
		</nav>
	)
}
