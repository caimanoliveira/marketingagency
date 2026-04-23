import { DndContext, DragEndEvent, useDraggable, useDroppable, closestCorners } from "@dnd-kit/core";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { NETWORKS } from "../lib/networks";
import type { PostListItem } from "../../shared/types";

type Status = "draft" | "scheduled" | "published" | "failed";
const COLUMNS: { id: Status; label: string }[] = [
  { id: "draft",     label: "Rascunho" },
  { id: "scheduled", label: "Agendado" },
  { id: "published", label: "Publicado" },
  { id: "failed",    label: "Falhou" },
];

interface Props { posts: PostListItem[]; }

export function KanbanBoard({ posts }: Props) {
  const qc = useQueryClient();
  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: Status }) =>
      api.updatePostStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["posts"] }),
  });

  function onDragEnd(e: DragEndEvent) {
    if (!e.over) return;
    const newStatus = e.over.id as Status;
    const id = e.active.id as string;
    const post = posts.find((p) => p.id === id);
    if (!post || post.status === newStatus) return;
    updateStatus.mutate({ id, status: newStatus });
  }

  const grouped: Record<Status, PostListItem[]> = {
    draft: [], scheduled: [], published: [], failed: [],
  };
  for (const p of posts) {
    if (p.status in grouped) grouped[p.status as Status].push(p);
  }

  return (
    <DndContext collisionDetection={closestCorners} onDragEnd={onDragEnd}>
      <div className="kanban">
        {COLUMNS.map((col) => (
          <KanbanColumn key={col.id} id={col.id} label={col.label} count={grouped[col.id].length}>
            {grouped[col.id].map((p) => <KanbanCard key={p.id} post={p} />)}
          </KanbanColumn>
        ))}
      </div>
    </DndContext>
  );
}

function KanbanColumn({ id, label, count, children }: { id: Status; label: string; count: number; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={`kanban-col ${isOver ? "kanban-col-over" : ""}`}>
      <div className={`kanban-col-header status-${id}`}>{label} <span style={{ opacity: 0.6 }}>({count})</span></div>
      <div className="kanban-col-body">{children}</div>
    </div>
  );
}

function KanbanCard({ post }: { post: PostListItem }) {
  const nav = useNavigate();
  const { setNodeRef, attributes, listeners, transform, isDragging } = useDraggable({ id: post.id });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`kanban-card ${isDragging ? "kanban-card-dragging" : ""}`}
      onDoubleClick={() => nav(`/posts/${post.id}`)}
    >
      {post.mediaThumb && <img src={post.mediaThumb} className="kanban-card-thumb" alt="" />}
      <div className="kanban-card-body">
        {post.body.slice(0, 80) || "(sem copy)"}
      </div>
      <div className="kanban-card-foot">
        {post.networks.map((n) => (
          <span
            key={n}
            className="kanban-card-net"
            style={{ background: NETWORKS[n as keyof typeof NETWORKS]?.color ?? "#666" }}
            title={n}
          >
            {n.slice(0, 2).toUpperCase()}
          </span>
        ))}
      </div>
    </div>
  );
}
