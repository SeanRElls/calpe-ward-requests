# Calpe Ward Requests - V2

A Progressive Web App (PWA) for managing hospital shift requests.

## 📁 Project Structure (NEW - Reorganized!)

```
V2/
├── index.html                # Main HTML structure (clean, no embedded code)
├── manifest.webmanifest      # PWA configuration
├── logo.png                  # Ward logo
│
├── css/
│   └── styles.css           # Complete application styling (well-documented)
│
├── js/
│   ├── config.js            # Configuration constants & Supabase connection
│   └── app.js               # Main application logic (well-documented)
│
├── icons/
│   ├── apple-touch-icon.png # iOS home screen icon
│   ├── icon-180.png         # 180×180 icon
│   ├── icon-192.png         # 192×192 icon
│   ├── icon-512.png         # 512×512 icon
│   ├── gb.svg               # UK flag (language selector)
│   └── es.svg               # Spanish flag (language selector)
│
└── index.html.backup        # Original monolithic file (backup)
```

## ✨ What's New in V2?

**Complete Reorganization for Future-Proofing:**
- ✅ **Separated concerns** - CSS, JavaScript, and HTML are now in separate files
- ✅ **Clear documentation** - Every file has comprehensive headers explaining its purpose
- ✅ **Labeled sections** - Code is organized into clearly marked functional blocks
- ✅ **Easy maintenance** - Find and modify specific features quickly
- ✅ **Consolidated assets** - All icons in one place

**Before:** One massive 5,878-line `index.html` file 😱  
**After:** Clean, organized structure with labeled sections 🎉

## 🎯 Key Features

- **PIN-based Authentication** - Secure 4-digit PIN login (no passwords)
- **Shift Request Management** - LD, 8-8, N, W, O/O* shift preferences
- **Priority System** - O¹ and O² for guaranteed off-duty requests
- **Week Commenting** - Add context to weekly shift preferences
- **Admin Panel** - Manage users, periods, and notices
- **Notice System** - Announcements with mandatory acknowledgment
- **Bilingual** - Full English/Spanish interface support
- **Request Deadlines** - Countdown timer with automatic locking
- **Cell Locking** - Admin-controlled individual day restrictions

## 🚀 Getting Started

### Prerequisites

- Modern web browser (Chrome, Firefox, Safari, Edge)
- Internet connection (uses Supabase cloud database)

### Running the Application

1. Open `index.html` in a web browser, or
2. Serve via a local web server:
   ```bash
   # Python 3
   python -m http.server 8000
   
   # OR using npx
   npx http-server -p 8000
   ```
3. Navigate to `http://localhost:8000`

### For Development

The codebase is now organized for easy maintenance:

- **Styling changes** → Edit `css/styles.css`
- **Logic changes** → Edit `js/app.js`
- **Configuration** → Edit `js/config.js`
- **Content/Structure** → Edit `index.html`

## 📖 Documentation

### Code Organization

#### `css/styles.css` (Fully Documented)
Well-organized stylesheet with 10 clearly labeled sections:
1. CSS Variables (Design Tokens)
2. Base Styles & Layout
3. Header & Navigation
4. Rota Table & Grid
5. Modal Dialogs
6. Forms & Buttons
7. Admin Panel
8. User Management
9. Notices System
10. Responsive Design (Mobile)

#### `js/app.js` (Fully Documented)
Comprehensive application logic with 14 major sections:
1. Internationalization (i18n)
2. Helper Functions
3. State Management
4. DOM References
5. Data Fetching
6. UI Rendering
7. Modal Management
8. Event Handlers
9. Request Management
10. Admin Functions
11. Notice System
12. Week Comments
13. Language Switching
14. Initialization

#### `js/config.js` (Fully Documented)
Configuration constants including:
- Supabase connection details
- Application limits (max requests per week, etc.)
- Storage keys

### Security Notes

- **Supabase Anon Key** - Safe to expose in client code (Row Level Security protects data)
- **PIN Verification** - Happens server-side via Supabase RPC functions
- **Session Storage** - PINs stored temporarily in sessionStorage (cleared on logout)
- **Admin Actions** - Require both admin flag AND PIN verification

## 🎨 Customization

### Changing Colors

Edit the CSS variables in `css/styles.css`:

```css
:root {
  --accent: #4F8DF7;        /* Primary blue */
  --cn-band: #a8e6a1;       /* Charge Nurse green */
  --sn-band: #9fd0ff;       /* Staff Nurse blue */
  --na-band: #ffd18a;       /* Nursing Assistant orange */
  /* ... more variables ... */
}
```

### Adding Languages

1. Add language pack to `I18N` object in `js/app.js`
2. Add translation function calls to UI elements
3. Add language flag to user modal

## 🔧 Maintenance

### Updating Supabase Credentials

Edit `js/config.js`:

```javascript
const SUPABASE_URL = "https://your-project.supabase.co";
const SUPABASE_ANON = "your-anon-key";
```

### Backup Strategy

- `index.html.backup` - Contains original monolithic version
- Regular database backups via Supabase dashboard
- Version control recommended (Git)

## 📱 PWA Installation

Users can install this as a mobile app:

1. **iOS** - Safari → Share → Add to Home Screen
2. **Android** - Chrome → Menu → Add to Home Screen
3. **Desktop** - Chrome → Address bar install icon

## 🐛 Troubleshooting

### App Not Loading
- Check browser console for errors
- Verify Supabase credentials in `js/config.js`
- Ensure all files are served from same domain

### Styling Issues
- Clear browser cache
- Check `css/styles.css` is loading (Network tab)
- Verify no CSS syntax errors

### JavaScript Errors
- Check `js/config.js` loads before `js/app.js`
- Verify Supabase library is loading
- Check console for specific error messages

## 📄 License

Internal use only - Calpe Ward, January 2026

## 🤝 Contributing

This is an internal hospital application. Contact the development team for changes.

---

**Version:** 2.0  
**Last Updated:** January 2026  
**Maintained by:** Calpe Ward Development Team
