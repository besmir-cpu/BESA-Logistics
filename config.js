const SUPABASE_URL = 'https://xyicnwfwsmbfcputqrbn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh5aWNud2Z3c21iZmNwdXRxcmJuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIwNzUzNTMsImV4cCI6MjEwNzY1MTM1M30.OKonsZOakM-_VQJ63mzXuB6UWCV-3h-Y28dz3guyuG4';

window.besaClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
