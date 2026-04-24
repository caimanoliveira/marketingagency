import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { KanbanBoard } from "../components/KanbanBoard";
import { SkeletonRow } from "../components/Skeleton";

export function Kanban() {
  const { data, isLoading } = useQuery({ queryKey: ["posts"], queryFn: api.listPosts });

  return (
    <div>
      <header style={{ marginBottom: 24 }}>
        <h1>Kanban</h1>
        <p style={{ color: "var(--lume-text-muted)", fontSize: 14, margin: "4px 0 0" }}>
          Arraste cards entre colunas pra mudar status. Duplo-clique abre o editor.
        </p>
      </header>
      {isLoading && <SkeletonRow count={4} />}
      {!isLoading && <KanbanBoard posts={data?.items ?? []} />}
    </div>
  );
}
