import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { KanbanBoard } from "../components/KanbanBoard";
import { SkeletonRow } from "../components/Skeleton";

export function Kanban() {
  const { data, isLoading } = useQuery({ queryKey: ["posts"], queryFn: api.listPosts });

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h1>Kanban</h1>
        <p style={{ color: "#888", fontSize: 13, margin: 0 }}>
          Arraste cards entre colunas pra mudar status. Duplo-clique abre o editor.
        </p>
      </div>
      {isLoading && <SkeletonRow count={4} />}
      {!isLoading && <KanbanBoard posts={data?.items ?? []} />}
    </div>
  );
}
