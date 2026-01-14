/**
 * =========================================================================
 * CALPE WARD REQUESTS - CONFIGURATION
 * =========================================================================
 * 
 * Central configuration file containing:
 * - Supabase connection credentials
 * - Application constants
 * - Business rules and limits
 * 
 * SECURITY NOTE:
 * The anon key shown here is safe to expose in client-side code.
 * It only allows row-level security policies you've defined in Supabase.
 * Never expose service_role keys in frontend code.
 * 
 * Last updated: January 2026
 * =========================================================================
 */


/* =========================================================================
   SUPABASE CONNECTION
   ========================================================================= */

/**
 * Supabase project URL
 * This is your unique Supabase project endpoint
 */
const SUPABASE_URL = "https://tbclufdtyefexwwitfsz.supabase.co";

/**
 * Supabase anonymous key (safe for client-side use)
 * This key is restricted by your database's Row Level Security policies
 */
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRiY2x1ZmR0eWVmZXh3d2l0ZnN6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcwODA4ODksImV4cCI6MjA4MjY1Njg4OX0.OYnj44QQCTD-5tqR2XSVt4oQso9Ol8ZLH2tLsRGIreA";

/**
 * Initialize Supabase client
 * This object is used throughout the app for all database operations
 */
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);


/* =========================================================================
   APPLICATION CONSTANTS
   ========================================================================= */

/**
 * Local storage key for persisting logged-in user ID
 * Allows auto-login on page reload
 */
const STORAGE_KEY = "calpeward.loggedInUserId";

/**
 * Maximum number of shift requests allowed per user per week
 * Users can enter up to 5 different requests across 7 days
 */
const MAX_REQUESTS_PER_WEEK = 5;

/**
 * Number of weeks displayed in the rota window
 * Shows 5 weeks at a time (standard shift planning period)
 */
const WINDOW_WEEKS = 5;


/* =========================================================================
   EXPORT (if using modules in the future)
   ========================================================================= */

/**
 * For future module support, you can export these:
 * 
 * export {
 *   SUPABASE_URL,
 *   SUPABASE_ANON,
 *   supabaseClient,
 *   STORAGE_KEY,
 *   MAX_REQUESTS_PER_WEEK,
 *   WINDOW_WEEKS
 * };
 */

// Expose to window for cross-file access
window.supabaseClient = supabaseClient;
window.STORAGE_KEY = STORAGE_KEY;
