# Migration Guide: Discord OAuth Update

## Breaking Changes

This update replaces email/password authentication with Discord OAuth SSO. The database schema has been updated and requires a migration.

## Database Migration

1. **Backup your database** (if you have existing data)

2. **Update your `.env` file** with Discord OAuth credentials:
   ```env
   DISCORD_CLIENT_ID="your-discord-client-id"
   DISCORD_CLIENT_SECRET="your-discord-client-secret"
   DISCORD_REDIRECT_URI="http://localhost:3001/api/auth/discord/callback"
   ```

3. **Run the migration**:
   ```bash
   cd backend
   npm run db:migrate
   ```

   This will:
   - Remove `email`, `name`, and `password` fields from User model
   - Add `discordId` and `discordUsername` fields
   - Update all related references

4. **If migration fails**, you may need to reset the database:
   ```bash
   npx prisma migrate reset
   ```

## Discord OAuth Setup

1. Go to https://discord.com/developers/applications
2. Create a new application
3. Go to OAuth2 section
4. Add redirect URI: `http://localhost:3001/api/auth/discord/callback` (or your production URL)
5. Copy Client ID and Client Secret to your `.env` file

## Frontend Changes

- Login page now uses Discord OAuth button
- Register page removed (users auto-register on first Discord login)
- All user references now use `discordUsername` instead of `name`/`email`
- Auth callback route added at `/auth/callback`

## Backend Changes

- Auth routes completely rewritten for Discord OAuth
- User model updated (no email/password)
- All routes updated to use `discordUsername`
- Predictions now lock when draft starts (not just deadline)
- Predictions hidden until draft completes
- Admin controls added: pause/resume draft
- Bulk player import endpoint added

## New Features

1. **Discord SSO**: All authentication via Discord OAuth
2. **Public Draft Board**: Draft board viewable without login
3. **Bulk Player Import**: Paste list of players (one per line, optional format: `Name | Position | Team`)
4. **Admin Controls**: Pause/resume draft, override picks
5. **Prediction Privacy**: Predictions locked at draft start and hidden until completion

## API Changes

### Removed Endpoints
- `POST /api/auth/register`
- `POST /api/auth/login`

### New Endpoints
- `GET /api/auth/discord/url` - Get Discord OAuth URL
- `GET /api/auth/discord/callback` - OAuth callback handler
- `POST /api/events/:id/players/bulk-import` - Bulk import players from text

### Updated Endpoints
- All user responses now return `discordUsername` instead of `name`/`email`
- `GET /api/stats/:eventId/rankings` - Only returns data if draft is completed
- `GET /api/stats/:eventId/my-stats` - Only returns stats if draft is completed
- `POST /api/draft/:eventId/pick` - Admins can override team selection
- `POST /api/draft/:eventId/pause` - Pause draft (admin only)
- `POST /api/draft/:eventId/resume` - Resume draft (admin only)

## Testing Checklist

- [ ] Discord OAuth login works
- [ ] Users auto-register on first login
- [ ] Draft board is publicly viewable
- [ ] Predictions lock when draft starts
- [ ] Predictions hidden until draft completes
- [ ] Admin can pause/resume draft
- [ ] Admin can override picks
- [ ] Bulk player import works
- [ ] Stats only show after draft completes
- [ ] All user displays show Discord username
