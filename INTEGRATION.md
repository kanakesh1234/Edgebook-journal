# Adding Lessons

## 1. Install
npm i @supabase/supabase-js dompurify react-router-dom @tiptap/react @tiptap/starter-kit @tiptap/core @tiptap/extension-image @tiptap/extension-link @tiptap/extension-youtube

## 2. Run sql/lessons.sql in the Supabase SQL editor
Also set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (or reuse your existing client in api.js).

## 3. Copy src/lessons/ into your app, then add routes
import LessonsFeed from './lessons/LessonsFeed'
import LessonView from './lessons/LessonView'
import LessonEditor from './lessons/LessonEditor'
import Friends from './lessons/Friends'
<Route path="/lessons" element={<LessonsFeed />} />
<Route path="/lessons/new" element={<LessonEditor />} />
<Route path="/lessons/:id" element={<LessonView />} />
<Route path="/friends" element={<Friends />} />

## 4. Sidebar item
<NavLink to="/lessons">Lessons</NavLink>

## Minato
Lessons live in their own tables and are never sent to Minato. Don't add them to whatever job or export feeds Minato.
