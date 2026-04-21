import { useRef, useState, DragEvent, ChangeEvent } from "react";
import { api } from "../lib/api";
import { useQueryClient } from "@tanstack/react-query";

interface Props {
  onUploaded?: (mediaId: string) => void;
  accept?: string;
}

const ACCEPT_DEFAULT = "image/jpeg,image/png,image/webp,video/mp4,video/quicktime";
const MAX_BYTES = 500 * 1024 * 1024;

export function MediaUploader({ onUploaded, accept = ACCEPT_DEFAULT }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    if (file.size > MAX_BYTES) {
      setError(`Arquivo grande demais (máx 500MB). Esse tem ${(file.size / 1024 / 1024).toFixed(1)}MB.`);
      return;
    }
    try {
      setProgress(0);
      const { mediaId, uploadUrl } = await api.presignUpload({
        filename: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      });

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", uploadUrl);
        xhr.setRequestHeader("content-type", file.type);
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(`upload_failed_${xhr.status}`));
        };
        xhr.onerror = () => reject(new Error("upload_network_error"));
        xhr.send(file);
      });

      setProgress(100);
      qc.invalidateQueries({ queryKey: ["media"] });
      onUploaded?.(mediaId);
      setTimeout(() => setProgress(null), 600);
    } catch (e) {
      setError(e instanceof Error ? e.message : "upload_failed");
      setProgress(null);
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  }

  return (
    <div
      className={`uploader ${dragging ? "drag" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      onClick={() => fileRef.current?.click()}
    >
      <input
        ref={fileRef}
        type="file"
        accept={accept}
        style={{ display: "none" }}
        onChange={onChange}
      />
      {progress === null && <p style={{ color: "#aaa" }}>Arraste uma imagem ou vídeo aqui, ou clique pra escolher.</p>}
      {progress !== null && (
        <div>
          <p style={{ color: "#aaa" }}>Enviando... {progress}%</p>
          <div className="progress"><div className="progress-bar" style={{ width: `${progress}%` }} /></div>
        </div>
      )}
      {error && <p className="err">{error}</p>}
    </div>
  );
}
