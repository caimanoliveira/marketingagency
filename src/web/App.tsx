import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Login } from "./pages/Login";
import { Layout } from "./components/Layout";
import { PostsList } from "./pages/PostsList";
import { Editor } from "./pages/Editor";
import { MediaPage } from "./pages/Media";
import { Settings } from "./pages/Settings";
import { Calendar } from "./pages/Calendar";
import { Kanban } from "./pages/Kanban";
import { Analytics } from "./pages/Analytics";
import { Benchmarks } from "./pages/Benchmarks";
import "./styles.css";

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<Layout />}>
            <Route path="/" element={<Navigate to="/posts" replace />} />
            <Route path="/posts" element={<PostsList />} />
            <Route path="/posts/new" element={<Editor />} />
            <Route path="/posts/:id" element={<Editor />} />
            <Route path="/media" element={<MediaPage />} />
            <Route path="/calendar" element={<Calendar />} />
            <Route path="/kanban" element={<Kanban />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/benchmarks" element={<Benchmarks />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
