# Auto Swiper

![Icon128.png](images/icon128.png)

A Chrome extension that automates swiping on **Tinder and Bumble**, with smart filters, human-like timing, safety limits, and a full analytics dashboard.

> **Disclaimer:** This extension is for personal and educational use. Automating dating apps may violate their Terms of Service and can lead to account restrictions. Use responsibly and at your own risk.

## Features

### Swiping
- **Auto Like / Auto Pass:** automatically swipe right, left, or both.
- **Like Ratio:** control what percentage of swipes are likes (0 to 100%).

### Timing and anti-detection
- **Base Delay:** set the delay between swipes (1 to 10 seconds).
- **Randomized Delay:** vary the delay within a min and max range to mimic human behavior.
- **Anti-Detection:** simulates profile viewing and photo scrolling between swipes.
- **Speed Mode:** rapid swiping (~260ms). High ban risk, use with caution.

### Safety limits
- **Session Limit:** stop after a set number of swipes in one session.
- **Daily Limit:** cap total swipes per day.
- **Short Breaks:** pause for a set duration after every N swipes.
- **Session Gaps:** longer breaks (in minutes) that mimic natural app usage.

### Smart filters
- **Age Range** and **Max Distance** filtering.
- **Minimum Photos** required on a profile.
- **Require Bio** and **Verified Only** toggles.
- **Like Keywords:** prefer profiles whose bio matches your interests.
- **Block Keywords:** skip profiles containing unwanted phrases.

### Analytics dashboard
- Lifetime stats: likes, passes, matches, day streak, and sessions.
- **Swipe Ratio** and **7-day Activity** charts.
- Searchable, paginated **swipe history**.
- **Recent Sessions** breakdown.
- **Log Match** to record matches manually.
- **Export to JSON or CSV**, plus a full **Reset**.

## Installation

1. Clone or download this repository.
2. Open Google Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** (top right).
4. Click **Load unpacked** and select the project directory.
5. The Auto Swiper icon appears in your toolbar, ready to use.

## Usage

1. Open Tinder or Bumble in a browser tab.
2. Click the Auto Swiper icon to open the popup.
3. Configure your preferences across the tabs:
   - **Swipe:** enable auto like/pass and set the like ratio.
   - **Timing:** set delays, randomization, and anti-detection.
   - **Limits:** set session, daily, break, and session-gap limits.
   - **Filters:** enable and configure age, distance, photos, and keyword filters.
4. Press **Start**. The popup switches to a live running view with session stats and the last swiped profile.
5. Use **Pause**, **Stop**, or **Log Match** as needed.
6. Open the **Dashboard** (grid icon) for charts, history, and exports.

## Permissions

| Permission | Why it is needed |
|---|---|
| `storage` | Save your settings, stats, and swipe history locally. |
| `tabs` | Detect the active Tinder or Bumble tab to control swiping. |
| `debugger` | Dispatch realistic input events so swipes look human-like. |
| `notifications` | Notify you about limits, breaks, and session events. |

### Host permissions

- `https://www.tinder.com/*` and `*://*.tinder.com/*`
- `https://bumble.com/*` and `*://*.bumble.com/*`

These let the extension interact with Tinder and Bumble to read profiles and perform swipes.

## Tech notes

- Built as a **Manifest V3** Chrome extension (`background.js` service worker, `content.js` injected scripts).
- The UI follows a **shadcn-style** monochrome design driven by a shared CSS design-token system. Restyle the entire app by editing the token block in `styles.css` (the dashboard mirrors the same tokens).
- Charts use [Chart.js](https://www.chartjs.org/) and read their colors from the design tokens, so the diagrams stay in sync with the theme.

## License

Distributed under the MIT License. See `LICENSE` for more information.
