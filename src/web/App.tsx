import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Login } from "./pages/Login";
import { Layout } from "./components/Layout";
import { PostsList } from "./pages/PostsList";
import { Editor } from "./pages/Editor";
import { MediaPage } from "./pages/Media";
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
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
