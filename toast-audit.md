# Toast Notification Audit

Based on an end-to-end review of the application architecture, user flows, and existing feedback mechanisms (alerts, console.logs, silent failures), the following events have been identified as requiring toast notifications to improve UX and eliminate silent failures or disruptive `alert()` calls.

## 1. Success Events

| File Path / Component | Event Trigger | Toast Type | Suggested Message | Current Implementation |
| :--- | :--- | :--- | :--- | :--- |
| `src/views/AuthView.tsx` (`handleSubmit`) | Successful login | Success | "Welcome back, {username}!" | Silent navigation |
| `src/views/AuthView.tsx` (`handleSubmit`) | Successful registration | Success | "Account created! Welcome to the notebook." | Silent navigation |
| `src/views/DashboardView.tsx` (`createGame`) | Match created successfully | Success | "Match drafted. Waiting for opponent." | Silent navigation |
| `src/views/BankView.tsx` (`handleOrder`) | Buy/Withdraw order submitted | Success | "Order submitted successfully. Awaiting merchant approval." | `alert()` |
| `src/views/BankView.tsx` (`updateOrderStatus`) | Admin updates order to DONE | Success | "Order status updated to DONE." | Silent success |
| `src/views/BankView.tsx` (`updateOrderStatus`) | Admin updates order to REJECTED | Success | "Order status updated to REJECTED." | Silent success |
| `src/views/GameView.tsx` (`copyLink`) | Invite link copied | Success | "Invite link scratched to clipboard!" | `alert()` |
| `src/components/Navbar.tsx` (`handleLogout`) | Successful logout | Info | "Logged out successfully." | Silent navigation |

## 2. Error Events

| File Path / Component | Event Trigger | Toast Type | Suggested Message | Current Implementation |
| :--- | :--- | :--- | :--- | :--- |
| `src/views/AuthView.tsx` (`handleSubmit`) | Login/Signup API failure | Error | (Dynamic API Error message) | Inline error text |
| `src/views/DashboardView.tsx` (`createGame`) | Insufficient balance | Error | "Insufficient balance to lock wager." | `alert()` |
| `src/views/DashboardView.tsx` (`createGame`) | Invalid wager | Error | "Invalid wager amount." | `alert()` |
| `src/views/DashboardView.tsx` (`createGame`) | Match creation API failure | Error | "Match creation failed. Please try again." | `console.error` + `alert()` |
| `src/views/DashboardView.tsx` (`useEffect`) | Fetching active matches failed | Error | "Failed to fetch active matches." | `console.error` |
| `src/views/DashboardView.tsx` (`useEffect`) | Fetching leaderboard failed | Error | "Failed to fetch leaderboard." | `console.error` |
| `src/views/BankView.tsx` (`useEffect`) | Fetching orders failed | Error | "Failed to fetch ledger history." | `console.error` |
| `src/views/BankView.tsx` (`handleOrder`) | Invalid amount | Error | "Invalid amount entered." | `alert()` |
| `src/views/BankView.tsx` (`handleOrder`) | Insufficient balance for withdrawal | Error | "Insufficient balance to withdraw." | `alert()` |
| `src/views/BankView.tsx` (`handleOrder`) | Order submission API failure | Error | (Dynamic API Error message) | `console.error` + `alert()` |
| `src/views/BankView.tsx` (`updateOrderStatus`) | Order update API failure | Error | "Failed to update status." | `console.error` + `alert()` |
| `src/views/ProfileView.tsx` (`useEffect`) | Fetch profile/history failure | Error | "Failed to fetch profile details." | `console.error` |
| `src/lib/AuthContext.tsx` (`refreshUser`) | Failed to refresh user token/session | Error | "Session expired. Please log in again." | `console.error` |

## 3. Warning / Edge Cases

| File Path / Component | Event Trigger | Toast Type | Suggested Message | Current Implementation |
| :--- | :--- | :--- | :--- | :--- |
| `src/views/GameView.tsx` (`useEffect`) | Opponent disconnects (socket `player_disconnected`) | Warning | "Opponent disconnected. Waiting for them to return..." | Unhandled visually? (Need to check socket events if there's a disconnect event mapped) |
| `src/views/DashboardView.tsx` | Entering an invalid or full room link | Warning | "This room is full or does not exist." | Silent redirect (needs implementation check) |

## 4. Informational Events

| File Path / Component | Event Trigger | Toast Type | Suggested Message | Current Implementation |
| :--- | :--- | :--- | :--- | :--- |
| `src/views/GameView.tsx` (`useEffect`) | Opponent joins (socket `game_start`) | Info | "Opponent joined. Match begins!" | Silent UI update |

---

## Planned Implementation: Toast System

To replace the aggressive `alert()` calls and unhandled console errors while maintaining the "sketchy/notebook" aesthetic, a centralized Toast Context/Provider will be implemented.

**Technical Specs:**
- **State Management**: React Context (`ToastContext`)
- **UI Component**: Custom `ToastContainer` and `Toast` components integrated into `App.tsx`.
- **Aesthetic**: Styling will utilize Tailwind CSS and `RoughJS` (or raw CSS with sketchy borders to mimic existing components) to ensure it fits seamlessly into the current UI.
- **Features**: Auto-dismiss (e.g., 3-5 seconds), manual dismiss, stacking for multiple notifications.
