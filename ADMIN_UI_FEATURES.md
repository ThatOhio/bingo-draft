# Admin Dashboard UI Features

## Overview
The Admin Dashboard now includes comprehensive UI components for all admin operations that previously required API calls.

## New Features Added

### 1. Create Event Tab
**Location:** Admin Dashboard → "Create Event" tab

**Features:**
- Event name input (required)
- Event code input (required, auto-uppercase, alphanumeric only, 3-20 chars)
- Description textarea (optional)
- Draft deadline datetime picker (optional)
- Draft start time datetime picker (optional)
- Form validation and error handling
- Success message and auto-redirect to Events tab

**API Endpoint:** `POST /api/events`

### 2. Event Management Tab Enhancements
**Location:** Admin Dashboard → "Manage Event" tab

#### Event Status Control
- Dropdown to change event status (Planned, Open, Drafting, Paused, Completed, Closed)
- Shows current status
- "Initialize Draft" button (appears when status is OPEN and draft not initialized)
- Shows draft progress if initialized

**API Endpoints:**
- `PUT /api/events/:id` (status update)
- `POST /api/draft/:eventId/initialize`

#### Team Management
- View current teams (displayed as badges)
- Add new team input with Enter key support
- Real-time team count display
- Team list refreshes after adding

**API Endpoint:** `POST /api/events/:id/teams`

#### Bulk Player Import
- Large textarea for pasting player lists
- Format support: `Name | Position | Team | Notes`
- One player per line
- Replaces all existing players
- Import button with loading state

**API Endpoint:** `POST /api/events/:id/players/bulk-import`

#### Export Event Data
- Export button downloads JSON file
- Includes all event data:
  - Players
  - Teams with rosters
  - Draft picks
  - User submissions/predictions
- File named: `event-{eventId}-export.json`

**API Endpoint:** `GET /api/stats/:eventId/export`

### 3. Enhanced Event Selection
- Dropdown to select event for management
- Automatically loads event details when selected
- Shows event info summary

## User Experience Improvements

### Form Validation
- Required fields marked with *
- Event code auto-formats (uppercase, alphanumeric only)
- Disabled buttons when required fields empty
- Clear error messages

### Loading States
- "Creating...", "Adding...", "Importing...", "Exporting..." states
- Buttons disabled during operations
- Prevents duplicate submissions

### Success Feedback
- Alert messages for successful operations
- Auto-refresh of data after changes
- Form clearing after successful creation

### Real-time Updates
- Event details refresh after status changes
- Team list updates after adding teams
- Event list refreshes after creating new event

## Tab Structure

1. **Users** - User management (existing)
2. **Events** - Event list view (existing)
3. **Create Event** - New event creation form
4. **Manage Event** - Comprehensive event management tools

## Usage Flow

### Creating a New Event
1. Go to Admin Dashboard
2. Click "Create Event" tab
3. Fill in event name and code (required)
4. Optionally add description and dates
5. Click "Create Event"
6. Redirected to Events tab to see new event

### Managing an Existing Event
1. Go to Admin Dashboard
2. Click "Manage Event" tab
3. Select event from dropdown
4. Event details load automatically
5. Use any of the management tools:
   - Change status
   - Initialize draft
   - Add teams
   - Import players
   - Export data

## Technical Details

### State Management
- Separate state for each form/operation
- Loading states prevent concurrent operations
- Event details cached and refreshed on changes

### Error Handling
- Try-catch blocks around all API calls
- User-friendly error messages via alerts
- Console logging for debugging

### Data Refresh
- `fetchData()` refreshes users and events list
- `fetchEventDetails()` refreshes selected event details
- Both called after successful operations

## Future Enhancements (Optional)
- Delete event functionality
- Edit event details (name, description, dates)
- Delete teams
- Individual player add/edit/delete
- CSV export option (in addition to JSON)
- Bulk team creation
- Copy event functionality
